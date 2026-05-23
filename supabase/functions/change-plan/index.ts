import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// =====================================================
// Mudanca de plano para assinante ja pagante (Fluxo A - portal web).
//
// Regras:
//  - Pro -> Plus  : upgrade IMEDIATO. Stripe troca o price item e prorateia
//                   a diferenca (cobrada na proxima fatura). Em trial, o
//                   trial_end e preservado automaticamente.
//  - Plus -> Pro  : downgrade AGENDADO pro fim do ciclo. Usa
//                   subscription_schedule (precisa trocar o price, nao da
//                   pra usar cancel_at_period_end).
//  - Pro  -> Free : downgrade AGENDADO pro fim do ciclo via
//                   cancel_at_period_end. Quando vira efetivo, o webhook
//                   marca o subscriber como plan='free', status='active'.
//  - Plus -> Free : idem acima.
//  - Free -> *    : NAO atendido aqui. Usa create-checkout-session (precisa
//                   coletar cartao e dados fiscais).
//
// Guards:
//  - status != 'active' bloqueia (past_due, pending, canceled). Cliente em
//    apuros tem que regularizar pelo Customer Portal antes.
//  - plano atual == target -> 400.
//  - ja existe um agendamento pendente -> 409. Exige reverter primeiro.
// =====================================================

type Plan = "free" | "pro" | "plus";

interface RequestBody {
  targetPlan: Plan;
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, plus: 2 };

function getPriceId(plan: "pro" | "plus"): string {
  const id =
    plan === "pro"
      ? Deno.env.get("STRIPE_PRICE_PRO")
      : Deno.env.get("STRIPE_PRICE_PLUS");
  if (!id) {
    throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} not configured`);
  }
  return id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return jsonResponse({ error: "Payment service not configured" }, 500);
    }

    const auth = await authorize(req);
    if (auth instanceof Response) return auth;
    const { user, admin } = auth;

    const body = (await req.json()) as RequestBody;
    const targetPlan = body?.targetPlan;
    if (!targetPlan || !["free", "pro", "plus"].includes(targetPlan)) {
      return jsonResponse({ error: "Invalid targetPlan" }, 400);
    }

    const { data: subscriber, error: subError } = await admin
      .from("subscribers")
      .select(
        "id, plan, status, stripe_subscription_id, stripe_customer_id, current_period_end, scheduled_plan, stripe_schedule_id"
      )
      .eq("user_id", user.id)
      .single();

    if (subError || !subscriber) {
      return jsonResponse({ error: "Subscriber not found" }, 404);
    }

    const currentPlan = subscriber.plan as Plan;

    if (currentPlan === targetPlan) {
      return jsonResponse({ error: "Voce ja esta neste plano" }, 400);
    }

    if (subscriber.status !== "active") {
      return jsonResponse(
        {
          error: `Nao e possivel mudar de plano com status '${subscriber.status}'. Regularize o pagamento primeiro.`,
          code: "status_not_active",
        },
        409
      );
    }

    if (currentPlan === "free") {
      return jsonResponse(
        {
          error: "Para assinar pela primeira vez use o checkout.",
          code: "use_checkout",
        },
        400
      );
    }

    if (!subscriber.stripe_subscription_id) {
      return jsonResponse(
        {
          error:
            "Subscription inconsistente: marcada como ativa mas sem stripe_subscription_id.",
        },
        500
      );
    }

    if (subscriber.scheduled_plan) {
      return jsonResponse(
        {
          error:
            "Voce ja tem uma mudanca de plano agendada. Cancele-a antes de agendar outra.",
          code: "scheduled_change_exists",
        },
        409
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-09-30.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const isUpgrade = PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan];

    // -----------------------------------------------------------------
    // UPGRADE Pro -> Plus: troca o item da subscription com proracao.
    // -----------------------------------------------------------------
    if (isUpgrade) {
      const sub = await stripe.subscriptions.retrieve(
        subscriber.stripe_subscription_id
      );
      const item = sub.items.data[0];
      if (!item) {
        return jsonResponse({ error: "Subscription sem itens" }, 500);
      }

      // 'always_invoice' cobra a diferenca prorateada imediatamente.
      // Em trial, Stripe respeita trial_end e a invoice so fecha no fim
      // do trial - cliente nao paga nada extra durante o periodo gratis.
      await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
        items: [{ id: item.id, price: getPriceId(targetPlan as "plus") }],
        proration_behavior: "always_invoice",
        metadata: { ...sub.metadata, plan: targetPlan },
      });

      // O webhook customer.subscription.updated sincroniza subscribers.plan.
      return jsonResponse({
        success: true,
        mode: "immediate",
        targetPlan,
        message:
          "Upgrade aplicado. A diferenca prorateada entra na proxima fatura.",
      });
    }

    // -----------------------------------------------------------------
    // DOWNGRADE para Free: cancel_at_period_end.
    // -----------------------------------------------------------------
    if (targetPlan === "free") {
      await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      await admin
        .from("subscribers")
        .update({
          scheduled_plan: "free",
          scheduled_change_at: subscriber.current_period_end,
          stripe_schedule_id: null,
        })
        .eq("id", subscriber.id);

      return jsonResponse({
        success: true,
        mode: "scheduled_at_period_end",
        targetPlan: "free",
        effectiveAt: subscriber.current_period_end,
      });
    }

    // -----------------------------------------------------------------
    // DOWNGRADE Plus -> Pro: subscription_schedule com 2 fases.
    //  fase 1: replica o estado atual ate o fim do periodo
    //  fase 2: 1 iteracao no price Pro (depois disso o schedule "release"
    //          e a subscription continua livre, podendo ser cancelada,
    //          renovada ou modificada de novo).
    // -----------------------------------------------------------------
    const sub = await stripe.subscriptions.retrieve(
      subscriber.stripe_subscription_id
    );
    const item = sub.items.data[0];
    if (!item) {
      return jsonResponse({ error: "Subscription sem itens" }, 500);
    }

    // Cria o schedule espelhando a subscription. Stripe gera 1 fase.
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriber.stripe_subscription_id,
    });
    const currentPhase = schedule.phases[0];
    if (!currentPhase) {
      return jsonResponse({ error: "Schedule sem fase inicial" }, 500);
    }

    const currentPrice =
      typeof item.price === "string" ? item.price : item.price.id;

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentPrice, quantity: item.quantity ?? 1 }],
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
          proration_behavior: "none",
        },
        {
          items: [{ price: getPriceId("pro"), quantity: 1 }],
          iterations: 1,
          proration_behavior: "none",
        },
      ],
      metadata: {
        user_id: user.id,
        subscriber_id: subscriber.id,
        target_plan: "pro",
      },
    });

    await admin
      .from("subscribers")
      .update({
        scheduled_plan: "pro",
        scheduled_change_at: subscriber.current_period_end,
        stripe_schedule_id: schedule.id,
      })
      .eq("id", subscriber.id);

    return jsonResponse({
      success: true,
      mode: "scheduled_at_period_end",
      targetPlan: "pro",
      effectiveAt: subscriber.current_period_end,
    });
  } catch (error) {
    console.error("change-plan error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
