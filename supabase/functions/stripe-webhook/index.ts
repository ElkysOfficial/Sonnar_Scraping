import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdminClient, jsonResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// cents - anti-tamper
const EXPECTED_AMOUNTS: Record<string, number> = {
  pro: 500,   // R$ 5,00
  plus: 1000, // R$ 10,00
};

type SubStatus = "active" | "past_due" | "canceled" | "pending";

const STATUS_MAP: Record<string, SubStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete: "pending",
  incomplete_expired: "canceled",
};

function isoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// Resolve plano a partir do price id do item da subscription. Cobre o caso
// de upgrade Pro -> Plus feito via subscriptions.update (o metadata.plan
// pode estar atualizado, mas o price e a fonte de verdade ultima).
function planFromPriceId(priceId: string | null): string | null {
  if (!priceId) return null;
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  const plus = Deno.env.get("STRIPE_PRICE_PLUS");
  if (priceId === pro) return "pro";
  if (priceId === plus) return "plus";
  return null;
}

// API Stripe 2024-09-30: current_period_end migrou para items[0]. Lemos
// com fallback no root da Subscription pra cobrir versoes antigas.
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  // deno-lint-ignore no-explicit-any
  const rootEnd = (sub as any).current_period_end;
  if (typeof rootEnd === "number") return rootEnd;
  return null;
}

// =====================================================
// Enfileiramento de notificacoes do bot WhatsApp.
// Inserimos em wa_plan_notifications - o bot wa-sender pollla a tabela e
// envia DM. (stripe_event_id, event_type) e unique - reenvios do webhook
// nao geram mensagem duplicada.
// =====================================================
type WaNotificationType =
  | "plan_upgraded_to_plus"
  | "plan_downgraded_to_pro"
  | "plan_canceled_to_free";

async function enqueuePlanNotification(
  supabase: SupabaseClient,
  params: {
    subscriberId: string;
    eventType: WaNotificationType;
    stripeEventId: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  // Busca o lid do assinante (wa_lid em subscriber_profiles). Sem lid, nao
  // ha como o bot enviar - registra skipped pra observabilidade.
  const { data: profile } = await supabase
    .from("subscriber_profiles")
    .select("wa_lid")
    .eq("subscriber_id", params.subscriberId)
    .maybeSingle();

  const lid = profile?.wa_lid ?? null;
  if (!lid) {
    console.log(
      `enqueuePlanNotification: subscriber ${params.subscriberId} sem wa_lid; skip`
    );
    return;
  }

  const { error } = await supabase.from("wa_plan_notifications").insert({
    subscriber_id: params.subscriberId,
    lid,
    event_type: params.eventType,
    stripe_event_id: params.stripeEventId,
    payload: params.payload ?? {},
  });

  // 23505 = unique_violation: ja existe (idempotencia), ignora.
  // deno-lint-ignore no-explicit-any
  if (error && (error as any).code !== "23505") {
    console.error("enqueuePlanNotification insert error:", error);
  }
}

// Atualiza um subscriber localizando-o por subscription_id, customer_id ou
// user_id (em ordem de preferência). Garante que activations via subscription.*
// e invoice.paid funcionem mesmo que checkout.session.completed nunca chegue.
async function upsertSubscriberFromSubscription(
  supabase: SupabaseClient,
  sub: Stripe.Subscription
): Promise<{ matched: boolean; userId: string | null }> {
  const subscriptionId = sub.id;
  const customerId = asString(sub.customer);
  const userId = asString(sub.metadata?.user_id);
  const planFromMeta = asString(sub.metadata?.plan);
  const item = sub.items?.data?.[0];
  const itemPriceId = asString(item?.price?.id);
  const resolvedPlan = planFromMeta ?? planFromPriceId(itemPriceId);
  const status = STATUS_MAP[sub.status] ?? "pending";
  const periodEnd = isoFromUnix(subscriptionPeriodEnd(sub));
  // Marca consumo do trial: setamos quando a subscription esta em trial
  // (status='trialing' no Stripe, mapeado pra 'active' aqui via STATUS_MAP).
  // Importante: usamos sub.status ORIGINAL, nao o mapeado, porque o mapa
  // achata trialing -> active.
  const isTrialing = sub.status === "trialing";
  const trialUsedAt = isTrialing ? new Date().toISOString() : null;

  const updatePayload: Record<string, unknown> = {
    status,
    stripe_subscription_id: subscriptionId,
    current_period_end: periodEnd,
  };
  if (customerId) updatePayload.stripe_customer_id = customerId;
  if (resolvedPlan) updatePayload.plan = resolvedPlan;

  // Sincronizacao de agendamento de Pro/Plus -> Free via cancel_at_period_end.
  // O caso Plus -> Pro NAO passa por aqui (so dispara subscription_schedule.*),
  // entao nao mexemos em registros que ja tenham stripe_schedule_id.
  if (sub.cancel_at_period_end) {
    updatePayload.scheduled_plan = "free";
    updatePayload.scheduled_change_at = periodEnd;
  }

  // Marca trial_used_at de forma idempotente: so atualiza se a coluna estiver
  // NULL no banco. Roda como UPDATE adicional condicional apos o match.
  async function markTrialUsedOnce(subscriberKey: { col: string; val: string }) {
    if (!trialUsedAt) return;
    await supabase
      .from("subscribers")
      .update({ trial_used_at: trialUsedAt })
      .eq(subscriberKey.col, subscriberKey.val)
      .is("trial_used_at", null);
  }

  // 1) Tenta por subscription_id (caso mais comum em renovações)
  const bySub = await supabase
    .from("subscribers")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId)
    .select("user_id");
  if (bySub.data && bySub.data.length > 0) {
    await markTrialUsedOnce({ col: "stripe_subscription_id", val: subscriptionId });
    return { matched: true, userId: bySub.data[0].user_id ?? null };
  }

  // 2) Tenta por customer_id (1ª ativação se checkout.session.completed nao chegou)
  if (customerId) {
    const byCust = await supabase
      .from("subscribers")
      .update(updatePayload)
      .eq("stripe_customer_id", customerId)
      .select("user_id");
    if (byCust.data && byCust.data.length > 0) {
      await markTrialUsedOnce({ col: "stripe_customer_id", val: customerId });
      return { matched: true, userId: byCust.data[0].user_id ?? null };
    }
  }

  // 3) Fallback final por user_id de metadata
  if (userId) {
    const byUser = await supabase
      .from("subscribers")
      .update(updatePayload)
      .eq("user_id", userId)
      .select("user_id");
    if (byUser.data && byUser.data.length > 0) {
      await markTrialUsedOnce({ col: "user_id", val: userId });
      return { matched: true, userId };
    }
  }

  return { matched: false, userId };
}

// Se o cliente reverteu o cancelamento (cancel_at_period_end == false) e
// nosso banco ainda tinha scheduled_plan='free' pendurado, limpa. Nao mexe
// em scheduled_plan='pro' que tem schedule_id - esses sao geridos pelos
// eventos subscription_schedule.*.
async function clearScheduledFreeIfReverted(
  supabase: SupabaseClient,
  sub: Stripe.Subscription
): Promise<void> {
  if (sub.cancel_at_period_end) return;
  await supabase
    .from("subscribers")
    .update({ scheduled_plan: null, scheduled_change_at: null })
    .eq("stripe_subscription_id", sub.id)
    .eq("scheduled_plan", "free")
    .is("stripe_schedule_id", null);
}

// =====================================================
// Fluxo B - VIP do WhatsApp (tabela vip_subscribers, chaveada por lid).
// Os Checkouts criados por create-vip-checkout carregam metadata.flow
// = 'whatsapp_vip' e metadata.lid. O webhook usa isso para ativar e
// manter o VIP automaticamente, sem aprovacao manual.
// =====================================================

const VIP_STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete: "pending",
  incomplete_expired: "canceled",
};

// Extrai os dados fiscais do customer_details do Checkout (necessarios
// para emissao de nota fiscal). O numero do endereco vem embutido na
// line1 no padrao brasileiro ("Rua X, 123") - extraido best-effort.
function extractFiscal(
  cd: Stripe.Checkout.Session.CustomerDetails | null
): Record<string, string | null> | null {
  if (!cd) return null;
  const onlyDigits = (s: string | null | undefined) =>
    s ? s.replace(/\D/g, "") : null;
  const taxIds = cd.tax_ids ?? [];
  const cpf = onlyDigits(taxIds.find((t) => t.type === "br_cpf")?.value);
  const cnpj = onlyDigits(taxIds.find((t) => t.type === "br_cnpj")?.value);

  const addr = cd.address;
  let street = addr?.line1 ?? null;
  let streetNumber: string | null = null;
  if (street) {
    const m = street.match(/,\s*([^,]+?)\s*$/);
    if (m && /\d/.test(m[1])) {
      streetNumber = m[1].trim();
      street = street.slice(0, m.index).trim();
    }
  }
  return {
    person_type: cnpj ? "pj" : cpf ? "pf" : null,
    cpf,
    cnpj,
    legal_name: cnpj ? cd.name ?? null : null,
    cep: onlyDigits(addr?.postal_code),
    street,
    street_number: streetNumber,
    complement: addr?.line2 ?? null,
    city: addr?.city ?? null,
    state_code: addr?.state ?? null,
  };
}

// Cria a conta do portal para o VIP recem-ativado, repassando os dados
// fiscais. Idempotente: 409 email_exists e tratado como sucesso.
async function provisionVipPortalAccount(
  vip: {
    email: string | null;
    user_name: string;
    lid: string;
    phone: string | null;
    filters: unknown;
  },
  fiscal: Record<string, string | null> | null
): Promise<void> {
  if (!vip.email) return;
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("WHATSAPP_LINK_SECRET");
  if (!baseUrl || !secret) {
    console.error("provisionVipPortalAccount: SUPABASE_URL/WHATSAPP_LINK_SECRET ausente");
    return;
  }
  try {
    const res = await fetch(`${baseUrl}/functions/v1/invite-whatsapp-subscriber`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-link-secret": secret },
      body: JSON.stringify({
        email: vip.email,
        name: vip.user_name,
        lid: vip.lid,
        phone: vip.phone,
        profile: vip.filters ?? {},
        fiscal,
      }),
    });
    if (!res.ok && res.status !== 409) {
      console.error(`provisionVipPortalAccount: invite recusou ${res.status}`);
    }
  } catch (e) {
    console.error("provisionVipPortalAccount: falha ao chamar invite", e);
  }
}

// Trata eventos do Fluxo B. Retorna null se o evento NAO for VIP - nesse
// caso o webhook segue com o fluxo normal do portal.
async function handleVipEvent(
  stripe: Stripe,
  supabase: SupabaseClient,
  event: Stripe.Event
): Promise<{ status: string; error: string | null } | null> {
  // ---- checkout.session.completed (VIP) ----
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.flow !== "whatsapp_vip") return null;
    const lid = session.metadata?.lid ?? null;
    if (!lid) return { status: "vip_missing_lid", error: "checkout VIP sem lid" };

    const { data: rows, error } = await supabase
      .from("vip_subscribers")
      .update({
        status: "active",
        payment_method: "card",
        stripe_customer_id: asString(session.customer),
        stripe_subscription_id: asString(session.subscription),
        updated_at: new Date().toISOString(),
      })
      .eq("lid", lid)
      .select("email, user_name, lid, phone, filters, portal_linked_at");

    if (error) return { status: "vip_update_failed", error: error.message };
    const vip = rows?.[0];
    if (!vip) return { status: "vip_not_found", error: `lid ${lid} sem registro` };

    // Conta do portal so na 1a ativacao, com os dados fiscais do Checkout.
    if (!vip.portal_linked_at) {
      await provisionVipPortalAccount(vip, extractFiscal(session.customer_details ?? null));
    }
    return { status: "vip_activated", error: null };
  }

  // ---- customer.subscription.created/updated/deleted (VIP) ----
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.metadata?.flow !== "whatsapp_vip") return null;
    const lid = sub.metadata?.lid ?? null;
    if (!lid) return { status: "vip_missing_lid", error: "subscription VIP sem lid" };

    const status =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : VIP_STATUS_MAP[sub.status] ?? "pending";

    await supabase
      .from("vip_subscribers")
      .update({
        status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: asString(sub.customer),
        current_period_end: isoFromUnix(subscriptionPeriodEnd(sub)),
        updated_at: new Date().toISOString(),
      })
      .eq("lid", lid);
    return { status: `vip_subscription_${status}`, error: null };
  }

  // ---- invoice.paid / invoice.payment_failed (VIP) ----
  // A fatura nao carrega nosso metadata; identifica o VIP pela subscription.
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = asString(invoice.subscription);
    if (!subscriptionId) return null;

    const { data: vip } = await supabase
      .from("vip_subscribers")
      .select("lid")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (!vip) return null; // nao e VIP - segue fluxo do portal

    if (event.type === "invoice.paid") {
      let periodEnd: string | null = null;
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        periodEnd = isoFromUnix(subscriptionPeriodEnd(sub));
      } catch (_e) {
        // mantem current_period_end como esta se o retrieve falhar
      }
      await supabase
        .from("vip_subscribers")
        .update({
          status: "active",
          ...(periodEnd ? { current_period_end: periodEnd } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("lid", vip.lid);
      return { status: "vip_invoice_paid", error: null };
    }

    const attemptCount = invoice.attempt_count ?? 0;
    const newStatus = attemptCount >= 3 ? "canceled" : "past_due";
    await supabase
      .from("vip_subscribers")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("lid", vip.lid);
    return { status: `vip_payment_failed_${newStatus}`, error: null };
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    console.error("Missing Stripe configuration");
    return jsonResponse({ error: "Webhook not configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-09-30.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const supabase = getAdminClient();

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) return jsonResponse({ error: "No signature" }, 401);

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Invalid webhook signature:", errMessage);
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    console.log(`Webhook received: ${event.type} (${event.id})`);

    // Idempotência
    const { data: existingEvent } = await supabase
      .from("stripe_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      return jsonResponse({ received: true, status: "already_processed" });
    }

    // ---- Fluxo B: VIP do WhatsApp ----
    // Tratado antes do fluxo do portal. Se nao for VIP, handleVipEvent
    // devolve null e o processamento do portal segue normalmente.
    const vipResult = await handleVipEvent(stripe, supabase, event);
    if (vipResult) {
      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: event.data.object,
        error: vipResult.error,
      });
      return jsonResponse({ received: true, status: vipResult.status });
    }

    // ---- checkout.session.completed ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
      const plan = session.metadata?.plan ?? null;

      if (!userId || !plan) {
        await supabase.from("stripe_events").insert({
          event_id: event.id,
          event_type: event.type,
          payload: session,
          error: "Missing user_id or plan in metadata",
        });
        return jsonResponse({ received: true, status: "missing_metadata" });
      }

      // anti-tamper (trial = 0 ok)
      const expected = EXPECTED_AMOUNTS[plan];
      const isTrial = session.amount_total === 0;
      if (!isTrial && expected && session.amount_total !== expected) {
        await supabase.from("stripe_events").insert({
          event_id: event.id,
          event_type: event.type,
          payload: session,
          error: `Amount mismatch: expected ${expected}, got ${session.amount_total}`,
        });
        return jsonResponse({ received: true, status: "amount_mismatch" });
      }

      if (session.currency && session.currency !== "brl") {
        await supabase.from("stripe_events").insert({
          event_id: event.id,
          event_type: event.type,
          payload: session,
          error: `Invalid currency: ${session.currency}`,
        });
        return jsonResponse({ received: true, status: "invalid_currency" });
      }

      const { error: updateError } = await supabase
        .from("subscribers")
        .update({
          plan,
          status: "active",
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error activating subscriber:", updateError);
        await supabase.from("stripe_events").insert({
          event_id: event.id,
          event_type: event.type,
          payload: session,
          error: `Update failed: ${updateError.message}`,
        });
        return jsonResponse({ received: true, status: "update_failed" });
      }

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: session,
        error: null,
      });

      return jsonResponse({ received: true, status: "success" });
    }

    // ---- customer.subscription.created / updated ----
    // Trata os dois iguais - ambos refletem estado autoritativo da assinatura.
    // Especialmente importante: se checkout.session.completed nao chega,
    // subscription.created garante a ativacao no inicio do trial.
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const subscription = event.data.object as Stripe.Subscription;

      // Le o plano anterior antes do upsert pra detectar transicao.
      let oldPlan: string | null = null;
      let subscriberId: string | null = null;
      {
        const { data } = await supabase
          .from("subscribers")
          .select("id, plan")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();
        oldPlan = data?.plan ?? null;
        subscriberId = data?.id ?? null;
      }

      const result = await upsertSubscriberFromSubscription(supabase, subscription);
      await clearScheduledFreeIfReverted(supabase, subscription);

      // Detecta transicao efetiva e enfileira notificacao do bot.
      if (subscriberId && oldPlan) {
        const itemPriceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const newPlan = planFromPriceId(itemPriceId);
        if (newPlan && newPlan !== oldPlan) {
          if (oldPlan === "pro" && newPlan === "plus") {
            await enqueuePlanNotification(supabase, {
              subscriberId,
              eventType: "plan_upgraded_to_plus",
              stripeEventId: event.id,
              payload: { from: "pro", to: "plus", subscriptionId: subscription.id },
            });
          } else if (oldPlan === "plus" && newPlan === "pro") {
            await enqueuePlanNotification(supabase, {
              subscriberId,
              eventType: "plan_downgraded_to_pro",
              stripeEventId: event.id,
              payload: { from: "plus", to: "pro", subscriptionId: subscription.id },
            });
          }
        }
      }

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: subscription,
        error: result.matched ? null : "No matching subscriber row",
      });

      return jsonResponse({
        received: true,
        status: result.matched ? "subscription_synced" : "subscriber_not_found",
      });
    }

    // ---- invoice.paid ----
    // Fallback adicional: na 1ª fatura (mesmo trial BRL 0,00), garante que o
    // subscriber esta active. Hidrata a partir da subscription completa.
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = asString(invoice.subscription);
      let matched = false;
      let detail: string | null = null;

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const result = await upsertSubscriberFromSubscription(supabase, subscription);
          matched = result.matched;
          if (!matched) detail = "No subscriber row matched";
        } catch (e) {
          detail = e instanceof Error ? e.message : "subscription retrieve failed";
        }
      } else {
        // Fatura sem subscription (one-off) - tenta apenas marcar via customer
        const customerId = asString(invoice.customer);
        if (customerId) {
          const upd = await supabase
            .from("subscribers")
            .update({ status: "active", stripe_customer_id: customerId })
            .eq("stripe_customer_id", customerId)
            .select("user_id");
          matched = !!(upd.data && upd.data.length > 0);
          if (!matched) detail = "No subscriber for customer";
        } else {
          detail = "Invoice without subscription nor customer";
        }
      }

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: invoice,
        error: detail,
      });

      return jsonResponse({
        received: true,
        status: matched ? "invoice_paid_synced" : "invoice_paid_no_match",
      });
    }

    // ---- invoice.payment_failed ----
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      const attemptCount = invoice.attempt_count ?? 0;

      if (subscriptionId) {
        const newStatus = attemptCount >= 3 ? "canceled" : "past_due";
        await supabase
          .from("subscribers")
          .update({ status: newStatus })
          .eq("stripe_subscription_id", subscriptionId);
      }

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: invoice,
        error: attemptCount >= 3 ? `Canceled after ${attemptCount} failed attempts` : null,
      });

      return jsonResponse({
        received: true,
        status: "payment_failed_logged",
        attempt: attemptCount,
      });
    }

    // ---- customer.subscription.deleted ----
    // Assinatura encerrada (cancel_at_period_end virou efetivo, ou cancelamento
    // imediato). Em vez de marcar 'canceled', rebaixamos a conta para o plano
    // Comunidade (free, active) - ela continua valida no portal e nos canais
    // publicos da comunidade. Sem assinatura no Stripe, sem agendamento
    // pendente.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      // Le o subscriber pra capturar o plano anterior antes do downgrade.
      let prevPlan: string | null = null;
      let subscriberId: string | null = null;
      {
        const { data } = await supabase
          .from("subscribers")
          .select("id, plan")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();
        prevPlan = data?.plan ?? null;
        subscriberId = data?.id ?? null;
      }

      await supabase
        .from("subscribers")
        .update({
          plan: "free",
          status: "active",
          stripe_subscription_id: null,
          current_period_end: null,
          scheduled_plan: null,
          scheduled_change_at: null,
          stripe_schedule_id: null,
        })
        .eq("stripe_subscription_id", subscription.id);

      if (subscriberId && (prevPlan === "pro" || prevPlan === "plus")) {
        await enqueuePlanNotification(supabase, {
          subscriberId,
          eventType: "plan_canceled_to_free",
          stripeEventId: event.id,
          payload: { from: prevPlan, to: "free", subscriptionId: subscription.id },
        });
      }

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: subscription,
        error: null,
      });

      return jsonResponse({ received: true, status: "downgraded_to_free" });
    }

    // ---- subscription_schedule.released / .completed / .canceled ----
    // Eventos do schedule criado em change-plan para Plus -> Pro:
    //  - completed: a fase 2 (Pro) entrou em vigor e o schedule terminou.
    //               A subscription continua viva, agora no price Pro - o
    //               evento customer.subscription.updated subsequente atualiza
    //               subscribers.plan via planFromPriceId.
    //  - released : cliente desistiu do downgrade (revert-scheduled-change).
    //               A subscription volta ao estado livre.
    //  - canceled : caso raro - schedule foi cancelado antes de entrar em
    //               vigor. Tratamos igual a released.
    // Em todos os casos limpamos scheduled_* do subscriber.
    if (
      event.type === "subscription_schedule.released" ||
      event.type === "subscription_schedule.completed" ||
      event.type === "subscription_schedule.canceled"
    ) {
      const schedule = event.data.object as Stripe.SubscriptionSchedule;
      await supabase
        .from("subscribers")
        .update({
          scheduled_plan: null,
          scheduled_change_at: null,
          stripe_schedule_id: null,
        })
        .eq("stripe_schedule_id", schedule.id);

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: schedule,
        error: null,
      });

      return jsonResponse({
        received: true,
        status: `schedule_${event.type.split(".")[1]}`,
      });
    }

    // Outros eventos: só loga
    await supabase.from("stripe_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
      error: null,
    });

    return jsonResponse({ received: true, status: "logged" });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
