import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
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
  const status = STATUS_MAP[sub.status] ?? "pending";
  const periodEnd = isoFromUnix(sub.current_period_end);

  const updatePayload: Record<string, unknown> = {
    status,
    stripe_subscription_id: subscriptionId,
    current_period_end: periodEnd,
  };
  if (customerId) updatePayload.stripe_customer_id = customerId;
  if (planFromMeta) updatePayload.plan = planFromMeta;

  // 1) Tenta por subscription_id (caso mais comum em renovações)
  const bySub = await supabase
    .from("subscribers")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId)
    .select("user_id");
  if (bySub.data && bySub.data.length > 0) {
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
      return { matched: true, userId };
    }
  }

  return { matched: false, userId };
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
    apiVersion: "2023-10-16",
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
      const result = await upsertSubscriberFromSubscription(supabase, subscription);

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
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from("subscribers")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subscription.id);

      await supabase.from("stripe_events").insert({
        event_id: event.id,
        event_type: event.type,
        payload: subscription,
        error: null,
      });

      return jsonResponse({ received: true, status: "subscription_deleted" });
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
