import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

interface CancelSubscriptionRequest {
  subscriberId: string;
  stripeSubscriptionId?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authorize(req, ["owner"]);
    if (auth instanceof Response) return auth;
    const { admin } = auth;

    const { subscriberId, stripeSubscriptionId } = (await req.json()) as CancelSubscriptionRequest;
    if (!subscriberId) {
      return jsonResponse({ error: "Missing subscriberId" }, 400);
    }

    // Cancela no Stripe (best effort — não bloqueia se falhar)
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeSubscriptionId && stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, {
          apiVersion: "2023-10-16",
          httpClient: Stripe.createFetchHttpClient(),
        });
        await stripe.subscriptions.cancel(stripeSubscriptionId);
        console.log(`Stripe subscription ${stripeSubscriptionId} canceled`);
      } catch (stripeError) {
        console.error("Stripe cancellation error:", stripeError);
      }
    }

    const { error } = await admin
      .from("subscribers")
      .update({ status: "canceled" })
      .eq("id", subscriberId);

    if (error) {
      console.error("Error updating subscriber:", error);
      return jsonResponse({ error: "Failed to cancel subscriber" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Error in admin-cancel-subscription:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
