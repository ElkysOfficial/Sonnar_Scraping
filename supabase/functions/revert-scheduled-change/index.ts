import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// =====================================================
// Cliente desistiu da mudanca de plano agendada (downgrade).
// Duas variantes:
//  - Tem stripe_schedule_id (Plus -> Pro): libera o schedule. Stripe
//    desvincula da subscription, que volta ao comportamento livre.
//  - Sem schedule_id mas scheduled_plan='free' (Pro/Plus -> Free):
//    desfaz cancel_at_period_end.
//
// As 3 colunas (scheduled_plan, scheduled_change_at, stripe_schedule_id)
// sao limpas aqui e reafirmadas pelo webhook subsequente.
// =====================================================

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

    const { data: subscriber, error: subError } = await admin
      .from("subscribers")
      .select(
        "id, plan, status, stripe_subscription_id, scheduled_plan, stripe_schedule_id"
      )
      .eq("user_id", user.id)
      .single();

    if (subError || !subscriber) {
      return jsonResponse({ error: "Subscriber not found" }, 404);
    }

    if (!subscriber.scheduled_plan) {
      return jsonResponse(
        { error: "Voce nao tem mudanca de plano agendada." },
        400
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-09-30.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    if (subscriber.stripe_schedule_id) {
      // Plus -> Pro agendado. Libera o schedule (subscription continua com o Plus).
      await stripe.subscriptionSchedules.release(
        subscriber.stripe_schedule_id
      );
    } else if (subscriber.stripe_subscription_id) {
      // Pro/Plus -> Free agendado via cancel_at_period_end. Desfaz.
      await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
        cancel_at_period_end: false,
      });
    } else {
      return jsonResponse(
        { error: "Agendamento inconsistente: sem subscription nem schedule." },
        500
      );
    }

    await admin
      .from("subscribers")
      .update({
        scheduled_plan: null,
        scheduled_change_at: null,
        stripe_schedule_id: null,
      })
      .eq("id", subscriber.id);

    return jsonResponse({
      success: true,
      message: "Mudanca de plano cancelada. Voce continua no plano atual.",
    });
  } catch (error) {
    console.error("revert-scheduled-change error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
