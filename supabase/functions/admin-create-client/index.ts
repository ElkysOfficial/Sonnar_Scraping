import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";
import { renderSonnarEmail } from "../_shared/emailTemplate.ts";

interface AdminClientPayload {
  fullName: string;
  email: string;
  phone: string;       // E.164 sem +, ex: 5511999999999
  plan: "pro" | "plus" | "free";
  stacks?: string[];
  seniority?: string;
  workMode?: string[];
  minSalary?: number | null;
  location?: string | null;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function welcomeEmail(name: string, email: string, password: string, loginUrl: string): string {
  return renderSonnarEmail({
    preheader: "Suas credenciais de acesso ao Sonnar",
    greeting: `Olá, ${name}.`,
    intro:
      "Seja bem-vindo(a) ao Sonnar. Sua conta foi criada por um administrador e suas credenciais de acesso estão disponíveis abaixo.",
    credentials: [
      { label: "E-mail", value: email, highlight: true },
      { label: "Senha provisória", value: password },
    ],
    cta: { label: "Acessar agora", href: loginUrl },
    postCta:
      "No primeiro acesso, será solicitada a alteração da senha provisória por uma senha de uso pessoal.",
    signOff: "Atenciosamente,",
    signature: "Equipe Sonnar",
    footnotes: [
      "O Sonnar é uma plataforma de curadoria de vagas de TI personalizadas, conectando profissionais a oportunidades alinhadas com seu perfil, senioridade e modelo de trabalho preferido.",
      "Caso você não reconheça este acesso ou não tenha solicitado este cadastro, solicitamos contato imediato com nossa equipe.",
      "Permanecemos à disposição. Este e-mail aceita resposta direta.",
    ],
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authorize(req, ["owner", "admin"]);
    if (auth instanceof Response) return auth;
    const { admin } = auth;

    const payload = (await req.json()) as AdminClientPayload;

    if (!payload.fullName || !payload.email || !payload.phone || !payload.plan) {
      return jsonResponse({ error: "Missing required fields (fullName, email, phone, plan)" }, 400);
    }
    if (!["free", "pro", "plus"].includes(payload.plan)) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }

    const email = payload.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();

    // Bloqueia se já existe
    const { data: existing } = await admin.auth.admin.listUsers();
    if (existing?.users?.some((u) => u.email?.toLowerCase() === email)) {
      return jsonResponse({ error: "Já existe um usuário com esse e-mail" }, 409);
    }

    // Monta metadata para o trigger handle_new_user.
    // Schema: name + plan; profile só se Pro/Plus.
    const userMetadata: Record<string, unknown> = {
      name: payload.fullName,
      plan: payload.plan,
    };

    if (payload.plan !== "free") {
      userMetadata.profile = {
        whatsapp: payload.phone,
        stack: payload.stacks ?? [],
        seniority: payload.seniority ?? "pleno",
        work_models: payload.workMode ?? ["remote"],
        min_salary: payload.minSalary ?? null,
        location: payload.location ?? null,
      };
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (createError || !created.user) {
      console.error("Error creating user:", createError);
      return jsonResponse({ error: `Failed to create user: ${createError?.message ?? "unknown"}` }, 500);
    }

    // O trigger criou subscribers com status='pending' para Pro/Plus.
    // Como é cliente comp-ado pelo admin, ativamos imediatamente.
    if (payload.plan !== "free") {
      const { error: activateError } = await admin
        .from("subscribers")
        .update({ status: "active" })
        .eq("user_id", created.user.id);
      if (activateError) {
        console.error("Error activating admin-created client:", activateError);
      }
    }

    // Envia email de boas-vindas (best effort)
    let emailSent = false;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const loginUrl = `${req.headers.get("origin") ?? "https://sonnarjobs.com.br"}/login`;
        const { error: sendError } = await resend.emails.send({
          from: "Sonnar <noreply@sonnarjobs.com.br>",
          to: [email],
          subject: "Bem-vindo ao Sonnar - sua conta foi criada",
          html: welcomeEmail(payload.fullName, email, tempPassword, loginUrl),
        });
        emailSent = !sendError;
        if (sendError) console.error("Resend error:", sendError);
      } catch (e) {
        console.error("Email send exception:", e);
      }
    }

    return jsonResponse({
      success: true,
      userId: created.user.id,
      emailSent,
      tempPassword: emailSent ? undefined : tempPassword,
      message: emailSent
        ? `Cliente criado. Email com credenciais enviado para ${email}.`
        : `Cliente criado. Repasse a senha temporária manualmente: ${tempPassword}`,
    });
  } catch (error) {
    console.error("Error in admin-create-client:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
