import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// =====================================================
// Mudanca de plano para assinante ja pagante (Fluxo A - portal web).
//
// Regras:
//  - Pro -> Plus  : upgrade IMEDIATO com proracao. Stripe troca o price
//                   item e preserva trial_end quando aplicavel.
//  - Plus -> Pro  : downgrade AGENDADO pro fim do periodo PAGO via
//                   subscription_schedule. Em trial, a fase 1 estende-se
//                   ate periodEnd (= fim do trial + 1 ciclo pago) e nao
//                   ate o fim do trial - garante que cliente nao perde
//                   o Plus durante o trial recem-contratado.
//  - Pro  -> Free : cancel_at_period_end.
//  - Plus -> Free : idem.
//  - Free -> *    : NAO atendido aqui. Usa create-checkout-session.
//
// API Stripe 2024-09-30: current_period_end vive em items.data[0], NAO
// no root da Subscription. periodEndFromSubscription cobre os dois locais.
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

function periodEndFromSubscription(sub: Stripe.Subscription): number | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  // deno-lint-ignore no-explicit-any
  const rootEnd = (sub as any).current_period_end;
  if (typeof rootEnd === "number") return rootEnd;
  return null;
}

function tsToIso(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
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
        "id, plan, status, stripe_subscription_id, stripe_customer_id, scheduled_plan, stripe_schedule_id"
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

    // Sempre lemos a subscription do Stripe - o banco pode estar desatualizado
    // (visto em prod com current_period_end NULL).
    const sub = await stripe.subscriptions.retrieve(
      subscriber.stripe_subscription_id
    );
    const item = sub.items.data[0];
    if (!item) {
      return jsonResponse({ error: "Subscription sem itens" }, 500);
    }

    // Detecta schedule orfao no Stripe que nao chegou no nosso banco.
    if (sub.schedule && !subscriber.stripe_schedule_id) {
      const scheduleId =
        typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
      return jsonResponse(
        {
          error:
            "Detectamos um agendamento pendente na sua conta. Entre em contato com o suporte.",
          code: "orphan_schedule",
          scheduleId,
        },
        409
      );
    }

    const periodEnd = periodEndFromSubscription(sub);
    if (!periodEnd) {
      return jsonResponse(
        {
          error:
            "Nao foi possivel determinar o fim do periodo atual. Tente em alguns minutos.",
        },
        500
      );
    }

    const isUpgrade = PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan];

    // -----------------------------------------------------------------
    // UPGRADE Pro -> Plus
    // -----------------------------------------------------------------
    if (isUpgrade) {
      await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
        items: [{ id: item.id, price: getPriceId(targetPlan as "plus") }],
        proration_behavior: "always_invoice",
        metadata: { ...sub.metadata, plan: targetPlan },
      });
      return jsonResponse({
        success: true,
        mode: "immediate",
        targetPlan,
        message:
          "Upgrade aplicado. A diferenca prorateada entra na proxima fatura.",
      });
    }

    // -----------------------------------------------------------------
    // DOWNGRADE para Free
    // -----------------------------------------------------------------
    if (targetPlan === "free") {
      await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      await admin
        .from("subscribers")
        .update({
          scheduled_plan: "free",
          scheduled_change_at: tsToIso(periodEnd),
          stripe_schedule_id: null,
          current_period_end: tsToIso(periodEnd),
        })
        .eq("id", subscriber.id);

      return jsonResponse({
        success: true,
        mode: "scheduled_at_period_end",
        targetPlan: "free",
        effectiveAt: tsToIso(periodEnd),
      });
    }

    // -----------------------------------------------------------------
    // DOWNGRADE Plus -> Pro (schedule com 2 fases)
    // -----------------------------------------------------------------
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriber.stripe_subscription_id,
    });

    const currentPhase = schedule.phases[0];
    if (!currentPhase) {
      try { await stripe.subscriptionSchedules.release(schedule.id); } catch (_) { /* ignore */ }
      return jsonResponse({ error: "Schedule sem fase inicial" }, 500);
    }

    const currentPrice =
      typeof item.price === "string" ? item.price : item.price.id;
    const nowSec = Math.floor(Date.now() / 1000);
    const trialStillActive =
      typeof sub.trial_end === "number" && sub.trial_end > nowSec;

    try {
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: currentPrice, quantity: item.quantity ?? 1 }],
            start_date: currentPhase.start_date,
            end_date: periodEnd,
            ...(trialStillActive ? { trial_end: sub.trial_end as number } : {}),
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
    } catch (e) {
      try { await stripe.subscriptionSchedules.release(schedule.id); } catch (_) { /* ignore */ }
      throw e;
    }

    const { error: dbError } = await admin
      .from("subscribers")
      .update({
        scheduled_plan: "pro",
        scheduled_change_at: tsToIso(periodEnd),
        stripe_schedule_id: schedule.id,
        current_period_end: tsToIso(periodEnd),
      })
      .eq("id", subscriber.id);

    if (dbError) {
      try { await stripe.subscriptionSchedules.release(schedule.id); } catch (_) { /* ignore */ }
      console.error("change-plan db update failed:", dbError);
      return jsonResponse(
        { error: "Falha ao registrar agendamento. Tente novamente." },
        500
      );
    }

    return jsonResponse({
      success: true,
      mode: "scheduled_at_period_end",
      targetPlan: "pro",
      effectiveAt: tsToIso(periodEnd),
    });
  } catch (error) {
    console.error("change-plan error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
