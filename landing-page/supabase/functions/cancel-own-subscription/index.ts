import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// Cliente cancela a propria assinatura. Cancela em Stripe (ao fim do periodo)
// e marca subscribers.status='canceled' apenas quando o webhook chegar — aqui
// so chamamos cancel_at_period_end para o usuario continuar com acesso ate la.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authorize(req);
    if (auth instanceof Response) return auth;
    const { user, admin } = auth;

    const { data: subscriber, error: subError } = await admin
      .from("subscribers")
      .select("id, stripe_subscription_id, plan, status")
      .eq("user_id", user.id)
      .single();

    if (subError || !subscriber) {
      return jsonResponse({ error: "Subscriber not found" }, 404);
    }

    if (subscriber.plan === "free") {
      return jsonResponse({ error: "Plano free não tem assinatura para cancelar" }, 400);
    }

    if (!subscriber.stripe_subscription_id) {
      // Sem subscription ativo no Stripe — apenas marca local.
      await admin.from("subscribers").update({ status: "canceled" }).eq("id", subscriber.id);
      return jsonResponse({ success: true, mode: "local_only" });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return jsonResponse({ error: "Payment service not configured" }, 500);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Cancela ao fim do periodo — usuario continua com acesso ate la.
    await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return jsonResponse({ success: true, mode: "scheduled_at_period_end" });
  } catch (error) {
    console.error("cancel-own-subscription error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
