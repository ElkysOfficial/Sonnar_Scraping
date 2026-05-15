// resend-signup-otp - reemite um código novo respeitando cooldown de 60s
// desde o último envio (last_sent_at).
//
// Inputs (JSON): { email }
// Outputs:
//   200 { ok: true } - novo código enviado
//   429 { error: 'cooldown', retry_after } - aguarde X segundos
//   404 { error: 'not_found' } - sem cadastro pendente
//   409 { error: 'already_confirmed' } - email já confirmado, ir pro login

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";
import {
  generateOtpCode,
  hashOtp,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  sendOtpEmail,
} from "../_shared/otp.ts";

interface ResendBody {
  email?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: ResendBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return jsonResponse({ error: "invalid_email" }, 400);

  const admin = getAdminClient();

  try {
    const { data: usersPage, error: listErr } = await admin.auth.admin
      .listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;

    const user = usersPage.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (!user) return jsonResponse({ error: "not_found" }, 404);
    if (user.email_confirmed_at) {
      return jsonResponse({ error: "already_confirmed" }, 409);
    }

    const { data: otp } = await admin
      .from("email_signup_otps")
      .select("last_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (otp?.last_sent_at) {
      const elapsedMs = Date.now() - new Date(otp.last_sent_at).getTime();
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return jsonResponse(
          { error: "cooldown", retry_after: retryAfter },
          429,
        );
      }
    }

    const code = generateOtpCode();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const { error: upsertErr } = await admin
      .from("email_signup_otps")
      .upsert(
        {
          user_id: user.id,
          code_hash: codeHash,
          expires_at: expiresAt.toISOString(),
          attempts: 0,
          used_at: null,
          last_sent_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertErr) throw upsertErr;

    const userName =
      (user.user_metadata?.name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      null;

    await sendOtpEmail({ to: email, code, name: userName });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[resend-signup-otp]", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
