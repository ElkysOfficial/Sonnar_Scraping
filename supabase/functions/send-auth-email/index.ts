// Supabase Auth "Send Email Hook" - intercepta TODOS os emails transacionais
// disparados pelo Auth (signup, recovery, magic link, invite, change email) e
// envia via Resend usando o template Sonnar.
//
// Configuração necessária (uma vez):
//   1. Dashboard Supabase → Authentication → Hooks → "Send Email hook"
//      URL: https://<project-ref>.functions.supabase.co/send-auth-email
//      Secret: gere um (Standard Webhooks). Salve como SEND_EMAIL_HOOK_SECRET
//              no formato `v1,whsec_<base64>` em Edge Functions → Secrets.
//   2. Em Authentication → Email Templates, deixe os templates default - eles
//      só são usados quando a hook está OFF. Com a hook ON, o conteúdo HTML
//      vem 100% daqui.
//   3. Secrets necessárias:
//        RESEND_API_KEY            (sua chave da Resend)
//        SEND_EMAIL_HOOK_SECRET    (segredo da hook, v1,whsec_...)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderSonnarEmail, SonnarEmailOptions } from "../_shared/emailTemplate.ts";

interface AuthEmailHookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: { name?: string; full_name?: string; [k: string]: unknown };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      | "signup"
      | "login" // magic link
      | "magiclink"
      | "recovery"
      | "invite"
      | "email_change"
      | "email_change_new"
      | "reauthentication";
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

const FROM = "Sonnar <noreply@sonnarjobs.com.br>";

function greetingFor(user: AuthEmailHookPayload["user"]): string {
  const name =
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined);
  return name ? `Olá, ${name}.` : "Olá.";
}

function buildVerifyUrl(p: AuthEmailHookPayload): string {
  // Usa o endpoint oficial de verificação do Supabase Auth (mesmo padrão do
  // template default {{ .ConfirmationURL }}). O endpoint valida o token e
  // redireciona para `redirect_to` com a sessão estabelecida.
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const params = new URLSearchParams({
    token: p.email_data.token_hash,
    type: p.email_data.email_action_type,
    redirect_to: p.email_data.redirect_to || p.email_data.site_url,
  });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

function buildEmail(p: AuthEmailHookPayload): { subject: string; options: SonnarEmailOptions } {
  const greeting = greetingFor(p.user);
  const action = p.email_data.email_action_type;
  const verifyUrl = buildVerifyUrl(p);
  const token = p.email_data.token;

  const standardFootnotes = [
    "Caso o(a) senhor(a) não reconheça esta solicitação, ignore este e-mail. Nenhuma ação será tomada sem confirmação.",
    "Permanecemos à disposição. Este e-mail aceita resposta direta.",
  ];

  switch (action) {
    case "signup":
      return {
        subject: "Confirme seu cadastro no Sonnar",
        options: {
          preheader: "Confirme seu e-mail para ativar sua conta no Sonnar",
          greeting,
          intro:
            "Recebemos seu cadastro no Sonnar. Para ativar sua conta e começar a receber vagas personalizadas, confirme seu e-mail clicando no botão abaixo.",
          cta: { label: "Confirmar e-mail", href: verifyUrl },
          postCta:
            "Este link é válido por tempo limitado. Caso expire, basta solicitar um novo cadastro.",
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    case "recovery":
      return {
        subject: "Redefinição de senha - Sonnar",
        options: {
          preheader: "Use o código abaixo para redefinir sua senha",
          greeting,
          intro:
            "Recebemos uma solicitação para redefinir sua senha de acesso ao Sonnar. Volte para a página de redefinição e informe o código abaixo para criar uma nova senha.",
          otpCode: { label: "Seu código de verificação", value: token },
          postCta:
            "Por segurança, este código é de uso único e tem validade limitada. Caso não tenha solicitado a redefinição, ignore este e-mail.",
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    case "magiclink":
    case "login":
      return {
        subject: "Seu link de acesso ao Sonnar",
        options: {
          preheader: "Link de acesso único ao Sonnar",
          greeting,
          intro:
            "Use o botão abaixo para acessar sua conta no Sonnar. O link é válido por tempo limitado e de uso único.",
          cta: { label: "Acessar agora", href: verifyUrl },
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    case "invite":
      return {
        subject: "Você foi convidado para o Sonnar",
        options: {
          preheader: "Aceite seu convite para o Sonnar",
          greeting,
          intro:
            "Você foi convidado(a) para acessar o Sonnar, plataforma de curadoria de vagas de TI personalizadas. Aceite o convite para criar sua conta.",
          cta: { label: "Aceitar convite", href: verifyUrl },
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    case "email_change":
    case "email_change_new":
      return {
        subject: "Confirme a alteração de e-mail - Sonnar",
        options: {
          preheader: "Confirme seu novo endereço de e-mail no Sonnar",
          greeting,
          intro:
            "Recebemos uma solicitação para alterar o e-mail de acesso da sua conta no Sonnar. Confirme o novo endereço clicando no botão abaixo.",
          cta: { label: "Confirmar novo e-mail", href: verifyUrl },
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    case "reauthentication":
      return {
        subject: "Confirmação de identidade - Sonnar",
        options: {
          preheader: "Confirme sua identidade para continuar",
          greeting,
          intro:
            "Para concluir uma ação sensível na sua conta, precisamos confirmar sua identidade. Use o código abaixo.",
          otpCode: { label: "Seu código de verificação", value: token },
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };

    default:
      return {
        subject: "Notificação Sonnar",
        options: {
          preheader: "Notificação da sua conta Sonnar",
          greeting,
          intro: "Você recebeu uma notificação da sua conta Sonnar.",
          cta: { label: "Acessar plataforma", href: verifyUrl },
          signOff: "Atenciosamente,",
          signature: "Equipe Sonnar",
          footnotes: standardFootnotes,
        },
      };
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!hookSecret) {
    console.error("SEND_EMAIL_HOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "hook secret not configured" }), { status: 500 });
  }
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return new Response(JSON.stringify({ error: "resend not configured" }), { status: 500 });
  }

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);

  let payload: AuthEmailHookPayload;
  try {
    const wh = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));
    payload = wh.verify(rawBody, headers) as AuthEmailHookPayload;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  try {
    const { subject, options } = buildEmail(payload);
    const html = renderSonnarEmail(options);

    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [payload.user.email],
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: error.message ?? "send failed" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("send-auth-email error:", err);
    const message = err instanceof Error ? err.message : "internal error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
