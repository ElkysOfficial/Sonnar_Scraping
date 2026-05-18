// notify-vip-billing - envia e-mails de cobranca do VIP (Fluxo B) ao
// cliente: aviso de expiracao proxima (PIX), expiracao (PIX) e falha de
// pagamento recorrente (cartao). O aviso por WhatsApp e enviado pelo
// proprio bot; esta funcao cobre o canal de e-mail.
//
// Autenticada por segredo compartilhado (header x-link-secret), igual a
// invite-whatsapp-subscriber. Requer verify_jwt = false no config.toml.
//
// Input (JSON): { email, name?, kind }
//   kind: 'expiry_warning' | 'expired' | 'past_due'
// Output: 200 { ok: true } | 4xx/5xx { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders, jsonResponse } from "../_shared/auth.ts";
import { renderSonnarEmail } from "../_shared/emailTemplate.ts";

const FROM = "Sonnar <noreply@sonnarjobs.com.br>";

const COPY: Record<string, { subject: string; intro: string; postCta: string }> = {
  expiry_warning: {
    subject: "Seu acesso VIP vai expirar",
    intro:
      "Seu acesso VIP as vagas personalizadas vence em breve. Para nao perder o recebimento das vagas, faca um novo PIX e envie o comprovante pelo WhatsApp.",
    postCta: "Apos a confirmacao do pagamento, seu acesso e renovado por mais 30 dias.",
  },
  expired: {
    subject: "Seu acesso VIP expirou",
    intro:
      "Seu acesso VIP as vagas personalizadas expirou. Para voltar a receber as vagas, faca um novo PIX e envie o comprovante pelo WhatsApp.",
    postCta: "Assim que o pagamento for confirmado, reativamos o seu acesso.",
  },
  past_due: {
    subject: "Falha no pagamento da sua assinatura",
    intro:
      "A cobranca recorrente da sua assinatura VIP falhou. Atualize os dados do cartao no portal para manter o acesso as vagas personalizadas.",
    postCta: "Se o pagamento nao for regularizado, a assinatura sera cancelada automaticamente.",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("WHATSAPP_LINK_SECRET");
  if (!expectedSecret) {
    console.error("notify-vip-billing: WHATSAPP_LINK_SECRET nao configurado");
    return jsonResponse({ error: "service_not_configured" }, 500);
  }
  if (req.headers.get("x-link-secret") !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("notify-vip-billing: RESEND_API_KEY nao configurado");
    return jsonResponse({ error: "email_not_configured" }, 500);
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const copy = COPY[kind];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !copy) {
    return jsonResponse({ error: "invalid_input" }, 400);
  }

  const portalUrl = Deno.env.get("PORTAL_URL") || "https://sonnarjobs.com.br";
  const html = renderSonnarEmail({
    preheader: copy.subject,
    greeting: name ? `Olá, ${name}.` : "Olá.",
    intro: copy.intro,
    cta: { label: "Acessar o portal", href: `${portalUrl}/login` },
    postCta: copy.postCta,
    signOff: "Atenciosamente,",
    signature: "Equipe Sonnar",
    footnotes: [
      "Caso já tenha regularizado, desconsidere este e-mail.",
      "Permanecemos à disposição. Este e-mail aceita resposta direta.",
    ],
  });

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: copy.subject,
      html,
    });
    if (error) {
      console.error("notify-vip-billing resend:", error.message);
      return jsonResponse({ error: "send_failed" }, 502);
    }
  } catch (e) {
    console.error("notify-vip-billing:", e);
    return jsonResponse({ error: "send_failed" }, 502);
  }

  return jsonResponse({ ok: true });
});
