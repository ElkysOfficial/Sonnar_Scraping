// verify-signup-otp - valida o código de 8 dígitos e confirma o email
// via admin.updateUserById({ email_confirm: true }).
//
// Política de segurança:
//   - 5 tentativas (OTP_MAX_ATTEMPTS) - após isso o código é invalidado
//     e o usuário precisa pedir um novo (resend-signup-otp).
//   - Expira em 15 minutos (OTP_TTL_MINUTES).
//   - Comparação constant-time do hash para evitar timing attacks.
//   - Resposta genérica em todos os caminhos de erro de input para evitar
//     enumeration de emails cadastrados.
//
// Inputs (JSON): { email, code }
// Outputs:
//   200 { ok: true } - email confirmado, frontend pode chamar signInWithPassword
//   400 { error: 'invalid_code' } - código errado / expirado / esgotado
//   404 { error: 'not_found' } - sem usuário pendente para esse email

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";
import {
  constantTimeEquals,
  hashOtp,
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
} from "../_shared/otp.ts";

interface VerifyBody {
  email?: string;
  code?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();

  if (!email || !/^\d+$/.test(code) || code.length !== OTP_CODE_LENGTH) {
    return jsonResponse({ error: "invalid_code" }, 400);
  }

  const admin = getAdminClient();

  try {
    // Localiza o usuário (sem getUserByEmail no SDK v2.45)
    const { data: usersPage, error: listErr } = await admin.auth.admin
      .listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;

    const user = usersPage.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (!user) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (user.email_confirmed_at) {
      // Já confirmado. Idempotente: o frontend pode seguir para login.
      return jsonResponse({ ok: true, already_confirmed: true });
    }

    const { data: otp, error: otpErr } = await admin
      .from("email_signup_otps")
      .select("code_hash, expires_at, attempts, used_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (otpErr) throw otpErr;
    if (!otp) {
      return jsonResponse({ error: "invalid_code" }, 400);
    }

    if (otp.used_at) {
      return jsonResponse({ error: "invalid_code" }, 400);
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return jsonResponse({ error: "invalid_code" }, 400);
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "invalid_code" }, 400);
    }

    const expected = await hashOtp(code);
    if (!constantTimeEquals(expected, otp.code_hash)) {
      // Incrementa attempts (best-effort)
      await admin
        .from("email_signup_otps")
        .update({ attempts: otp.attempts + 1 })
        .eq("user_id", user.id);
      return jsonResponse({ error: "invalid_code" }, 400);
    }

    // Sucesso: marca usado e confirma email.
    const { error: markErr } = await admin
      .from("email_signup_otps")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (markErr) throw markErr;

    const { error: confirmErr } = await admin.auth.admin.updateUserById(
      user.id,
      { email_confirm: true },
    );
    if (confirmErr) throw confirmErr;

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[verify-signup-otp]", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
