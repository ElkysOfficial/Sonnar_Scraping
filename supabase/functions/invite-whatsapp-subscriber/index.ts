// invite-whatsapp-subscriber - cria a conta do portal para um assinante
// captado pelo WhatsApp (Fluxo B) e envia o e-mail de convite com
// login (e-mail) + senha temporaria. A conta ja nasce confirmada (sem OTP);
// no primeiro acesso o portal obriga a troca de senha.
//
// Autenticada por segredo compartilhado (header x-link-secret), igual a
// link-whatsapp. Requer verify_jwt = false no config.toml.
//
// Input (JSON): { email, name, lid, profile }
// Output: 200 { ok: true } | 409 { error: 'email_exists' } | 4xx/5xx { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";
import { renderSonnarEmail } from "../_shared/emailTemplate.ts";

const FROM = "Sonnar <noreply@sonnarjobs.com.br>";

function randInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 0x100000000) * maxExclusive);
}

// Senha temporaria forte: maiuscula, minuscula, digito e especial.
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digit + special;
  const pick = (set: string) => set[randInt(set.length)];
  let pass = pick(upper) + pick(lower) + pick(digit) + pick(special);
  for (let i = 0; i < 8; i++) pass += pick(all);
  return pass;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("WHATSAPP_LINK_SECRET");
  if (!expectedSecret) {
    console.error("invite-whatsapp-subscriber: WHATSAPP_LINK_SECRET nao configurado");
    return jsonResponse({ error: "service_not_configured" }, 500);
  }
  if (req.headers.get("x-link-secret") !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const lid = typeof body?.lid === "string" ? body.lid.trim() : "";
  const profile = body?.profile && typeof body.profile === "object" ? body.profile : {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return jsonResponse({ error: "invalid_email" }, 400);
  }

  const admin = getAdminClient();
  const tempPassword = generateTempPassword();

  // Cria a conta ja confirmada. O trigger handle_new_user gera
  // subscribers + subscriber_profiles a partir do metadata.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: name || "Assinante Sonnar", plan: "plus", profile },
  });

  if (createErr) {
    const msg = createErr.message || "";
    if (/already|registered|exist/i.test(msg)) {
      return jsonResponse({ error: "email_exists" }, 409);
    }
    console.error("invite-whatsapp-subscriber createUser:", msg);
    return jsonResponse({ error: "create_failed", message: msg }, 500);
  }

  const userId = created.user?.id;

  // Marca assinatura ativa + senha temporaria; vincula o wa_lid.
  try {
    if (userId) {
      await admin
        .from("subscribers")
        .update({ status: "active", must_change_password: true })
        .eq("user_id", userId);

      const { data: sub } = await admin
        .from("subscribers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (sub?.id && lid) {
        await admin
          .from("subscriber_profiles")
          .update({ wa_lid: lid, wa_linked_at: new Date().toISOString() })
          .eq("subscriber_id", sub.id);
      }
    }
  } catch (e) {
    console.error("invite-whatsapp-subscriber pos-ajuste:", e);
  }

  // E-mail de convite com login + senha temporaria.
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (resendApiKey) {
    try {
      const portalUrl = Deno.env.get("PORTAL_URL") || "https://sonnarjobs.com.br";
      const html = renderSonnarEmail({
        preheader: "Seu acesso ao Sonnar - login e senha temporaria",
        greeting: name ? `Olá, ${name}.` : "Olá.",
        intro:
          "Sua assinatura do Sonnar foi ativada. Use os dados abaixo para acessar o portal. No primeiro acesso, o sistema pedirá que você defina uma nova senha.",
        credentials: [
          { label: "Login (e-mail)", value: email, highlight: true },
          { label: "Senha temporária", value: tempPassword },
        ],
        cta: { label: "Acessar o portal", href: `${portalUrl}/login` },
        postCta:
          "Por segurança, logo após o primeiro login o portal solicitará a troca da senha temporária.",
        signOff: "Atenciosamente,",
        signature: "Equipe Sonnar",
        footnotes: [
          "Caso o(a) senhor(a) não reconheça esta solicitação, entre em contato com o suporte.",
          "Permanecemos à disposição. Este e-mail aceita resposta direta.",
        ],
      });
      const resend = new Resend(resendApiKey);
      const { error: sendErr } = await resend.emails.send({
        from: FROM,
        to: [email],
        subject: "Seu acesso ao Sonnar",
        html,
      });
      if (sendErr) console.error("invite-whatsapp-subscriber resend:", sendErr.message);
    } catch (e) {
      console.error("invite-whatsapp-subscriber email:", e);
      // Conta criada; falha de e-mail nao derruba a operacao.
    }
  }

  return jsonResponse({ ok: true });
});
