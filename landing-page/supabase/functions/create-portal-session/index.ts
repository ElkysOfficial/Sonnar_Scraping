import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// Stripe Customer Portal — usuario gerencia metodo de pagamento, faturas e
// cancelamento por la. Mais simples que reimplementar tudo.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (subError || !subscriber?.stripe_customer_id) {
      return jsonResponse({ error: "Customer Stripe não encontrado" }, 404);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const origin = req.headers.get("origin") ?? "https://sonnarjobs.com.br";
    const session = await stripe.billingPortal.sessions.create({
      customer: subscriber.stripe_customer_id,
      return_url: `${origin}/dashboard/assinatura`,
    });

    return jsonResponse({ portalUrl: session.url });
  } catch (error) {
    console.error("create-portal-session error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
