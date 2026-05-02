import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

interface RequestBody {
  plan: "pro" | "plus";
}

function getPriceIds(): Record<"pro" | "plus", string> {
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  const plus = Deno.env.get("STRIPE_PRICE_PLUS");
  if (!pro || !plus) {
    throw new Error("STRIPE_PRICE_PRO or STRIPE_PRICE_PLUS not configured");
  }
  return { pro, plus };
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

    const { plan } = (await req.json()) as RequestBody;
    if (!["pro", "plus"].includes(plan)) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }

    // Carrega o subscriber existente do usuário autenticado.
    const { data: subscriber, error: subError } = await admin
      .from("subscribers")
      .select("id, name, email, plan, status, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (subError || !subscriber) {
      return jsonResponse({ error: "Subscriber not found. Sign up first." }, 404);
    }

    if (subscriber.status === "active" && subscriber.plan === plan) {
      return jsonResponse({ error: "Você já tem esse plano ativo" }, 400);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Reaproveita customer existente, ou cria novo.
    let customerId = subscriber.stripe_customer_id;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: subscriber.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: subscriber.email,
          name: subscriber.name,
          metadata: { user_id: user.id, subscriber_id: subscriber.id },
        });
        customerId = customer.id;
      }
      await admin
        .from("subscribers")
        .update({ stripe_customer_id: customerId })
        .eq("id", subscriber.id);
    }

    const priceId = getPriceIds()[plan];
    const origin = req.headers.get("origin") ?? "https://sonnarjobs.com.br";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pagamento/confirmando`,
      cancel_url: `${origin}/pagar?canceled=true`,
      metadata: { user_id: user.id, subscriber_id: subscriber.id, plan },
      subscription_data: {
        // 7 dias gratis. Cliente cancela no periodo = nao paga nada.
        trial_period_days: 7,
        metadata: { user_id: user.id, subscriber_id: subscriber.id, plan },
      },
    });

    return jsonResponse({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Checkout session error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
