import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

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
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
      <tr><td style="background:linear-gradient(135deg,#2563EB 0%,#7C3AED 100%);padding:32px;text-align:center;color:#fff">
        <h1 style="margin:0;font-size:24px">Bem-vindo ao Sonnar</h1>
      </td></tr>
      <tr><td style="padding:32px">
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua conta foi criada por um administrador. Use os dados abaixo para entrar e começar a receber vagas:</p>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>E-mail:</strong> ${email}</p>
          <p style="margin:0"><strong>Senha temporária:</strong> <code style="background:#e9ecef;padding:2px 8px;border-radius:4px">${password}</code></p>
        </div>
        <p style="color:#dc3545;font-size:13px">⚠️ Troque sua senha no primeiro acesso.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#2563EB;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">Acessar agora</a>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:16px;text-align:center;color:#999;font-size:12px">Sonnar — Vagas de TI personalizadas</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
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
          subject: "Bem-vindo ao Sonnar — sua conta foi criada",
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
