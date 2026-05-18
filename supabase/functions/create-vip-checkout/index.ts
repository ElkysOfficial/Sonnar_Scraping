// create-vip-checkout - cria a sessao de Checkout do Stripe (assinatura
// recorrente, cartao) para um lead captado pelo WhatsApp (Fluxo B).
//
// Substitui o link generico PAYMENT_LINK_PRIVATE: cada lead recebe um
// Checkout proprio, amarrado ao seu LID do WhatsApp via metadata. O
// stripe-webhook usa esse LID para ativar/manter o vip_subscribers
// automaticamente, sem "pago" + comprovante + aprovacao manual.
//
// Coleta tambem os dados fiscais (tax_id_collection + billing_address)
// necessarios para emissao de nota fiscal.
//
// Autenticada por segredo compartilhado (header x-link-secret), igual a
// invite-whatsapp-subscriber. Requer verify_jwt = false no config.toml.
//
// Input (JSON): { lid, name, email, phone?, filters? }
// Output: 200 { checkoutUrl } | 409 { error: 'already_active' } | 4xx/5xx { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("WHATSAPP_LINK_SECRET");
  if (!expectedSecret) {
    console.error("create-vip-checkout: WHATSAPP_LINK_SECRET nao configurado");
    return jsonResponse({ error: "service_not_configured" }, 500);
  }
  if (req.headers.get("x-link-secret") !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const pricePlus = Deno.env.get("STRIPE_PRICE_PLUS");
  if (!stripeKey || !pricePlus) {
    console.error("create-vip-checkout: STRIPE_SECRET_KEY ou STRIPE_PRICE_PLUS ausente");
    return jsonResponse({ error: "service_not_configured" }, 500);
  }

  const body = await req.json().catch(() => null);
  const lid = typeof body?.lid === "string" ? body.lid.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const filters = body?.filters && typeof body.filters === "object" ? body.filters : {};

  if (!lid || !name || !email) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-09-30.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const supabase = getAdminClient();

  try {
    // Ja e VIP ativo? Nao gera novo Checkout.
    const { data: existing } = await supabase
      .from("vip_subscribers")
      .select("status, stripe_customer_id")
      .eq("lid", lid)
      .maybeSingle();

    if (existing?.status === "active") {
      return jsonResponse({ error: "already_active" }, 409);
    }

    // Reaproveita o customer do Stripe (por registro anterior ou por e-mail).
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const found = await stripe.customers.list({ email, limit: 1 });
      customerId = found.data[0]?.id ?? null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name,
        phone: phone ?? undefined,
        metadata: { lid, flow: "whatsapp_vip" },
      });
      customerId = customer.id;
    }

    // Registra/atualiza o lead como pending (cartao) antes do pagamento.
    const { error: upsertError } = await supabase
      .from("vip_subscribers")
      .upsert(
        {
          lid,
          user_name: name,
          email,
          phone,
          plan: "plus",
          filters,
          status: "pending",
          payment_method: "card",
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lid" },
      );
    if (upsertError) {
      console.error("create-vip-checkout: upsert vip_subscribers falhou", upsertError);
      return jsonResponse({ error: "db_error" }, 500);
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://sonnarjobs.com.br";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: pricePlus, quantity: 1 }],
      success_url: `${siteUrl}/?vip=confirmado`,
      cancel_url: `${siteUrl}/?vip=cancelado`,
      // Dados fiscais para emissao de nota fiscal. required: 'if_supported'
      // obriga o CPF/CNPJ para clientes do Brasil.
      tax_id_collection: { enabled: true, required: "if_supported" },
      billing_address_collection: "required",
      // LID amarra o pagamento ao assinante do WhatsApp no stripe-webhook.
      metadata: { lid, flow: "whatsapp_vip", plan: "plus" },
      subscription_data: {
        trial_period_days: 7,
        metadata: { lid, flow: "whatsapp_vip", plan: "plus" },
      },
    });

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error("create-vip-checkout error:", error);
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
