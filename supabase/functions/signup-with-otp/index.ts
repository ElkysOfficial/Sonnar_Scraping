// signup-with-otp - cria a conta via Admin API com email_confirm=false
// e dispara o código OTP de 8 dígitos por email (via Resend).
//
// Esta function substitui o supabase.auth.signUp do cliente quando o fluxo
// de confirmação por código (não por link) está ativo. Vantagens:
//   - Sem email duplicado (a confirmação nativa do Supabase fica off).
//   - Metadata e password ainda alimentam o trigger handle_new_user.
//   - Reaproveita user existente se ainda não confirmou (reenvia código).
//
// Inputs (JSON):
//   { email, password, metadata } - metadata é o objeto enviado para
//   auth.signUp.options.data hoje (plan, nome, endereço, profile, etc).
//
// Outputs:
//   200 { ok: true } - email enviado, frontend transita para step OTP
//   409 { error: 'already_registered' } - email já confirmado, mandar pro login
//   400 { error, message } - validação
//   500 { error } - erro interno

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";
import {
  generateOtpCode,
  hashOtp,
  OTP_TTL_MINUTES,
  sendOtpEmail,
} from "../_shared/otp.ts";

interface SignupBody {
  email?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function isStrongPassword(v: string): boolean {
  return (
    v.length >= 8 &&
    /[A-Z]/.test(v) &&
    /[a-z]/.test(v) &&
    /[0-9]/.test(v) &&
    /[^A-Za-z0-9]/.test(v)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: SignupBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const metadata = body.metadata ?? {};

  if (!isValidEmail(email)) {
    return jsonResponse({ error: "invalid_email" }, 400);
  }
  if (!isStrongPassword(password)) {
    return jsonResponse({ error: "weak_password" }, 400);
  }

  const admin = getAdminClient();

  try {
    // 1. Verifica se já existe um usuário com esse email.
    //    listUsers + filter local porque o admin não tem getUserByEmail
    //    no SDK v2.45. Paginamos só se for necessário (raro).
    const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw listErr;

    const found = existing.users.find(
      (u) => u.email?.toLowerCase() === email,
    );

    let userId: string;
    let userName: string | null = null;

    if (found) {
      // Email já confirmado? Bloqueia - usuário deve ir para o login.
      if (found.email_confirmed_at) {
        return jsonResponse({ error: "already_registered" }, 409);
      }

      // Email ainda pendente - reaproveita o user.
      userId = found.id;
      userName =
        (found.user_metadata?.name as string | undefined) ??
        (found.user_metadata?.full_name as string | undefined) ??
        null;

      // Atualiza password + metadata caso o usuário tenha refeito o cadastro
      // com dados diferentes (ex: trocou de plano).
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: metadata,
      });
      if (updErr) throw updErr;
    } else {
      // 2. Cria o usuário sem confirmar email (o OTP confirma depois).
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: metadata,
        });
      if (createErr || !created.user) {
        throw createErr ?? new Error("createUser returned no user");
      }
      userId = created.user.id;
      userName = (metadata.name as string | undefined) ?? null;
    }

    // 3. Gera código OTP, hasha e persiste (upsert por user_id).
    const code = generateOtpCode();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const { error: upsertErr } = await admin
      .from("email_signup_otps")
      .upsert(
        {
          user_id: userId,
          code_hash: codeHash,
          expires_at: expiresAt.toISOString(),
          attempts: 0,
          used_at: null,
          last_sent_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertErr) throw upsertErr;

    // 4. Envia o email com o código. Falha aqui não desfaz o user
    //    (resend-signup-otp permite tentar de novo).
    await sendOtpEmail({ to: email, code, name: userName });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[signup-with-otp]", err);
    const message = err instanceof Error ? err.message : "internal_error";
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});
