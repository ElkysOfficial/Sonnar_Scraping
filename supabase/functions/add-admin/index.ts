import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";
import { renderSonnarEmail } from "../_shared/emailTemplate.ts";

interface AddAdminRequest {
  email: string;
}

// Generate a random 8-character password
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authorize(req, ["owner"]);
    if (auth instanceof Response) return auth;
    const { admin: supabaseAdmin } = auth;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const { email }: AddAdminRequest = await req.json();

    if (!email) {
      return jsonResponse({ error: "Email is required" }, 400);
    }

    console.log(`Adding admin: ${email}`);

    // Generate temporary password
    const tempPassword = generateTempPassword();

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let targetUserId: string | null = null;
    let isNewUser = false;

    const existingUser = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      targetUserId = existingUser.id;
      console.log(`Found existing user: ${targetUserId}`);
      
      // Update password for existing user
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword
      });
      console.log(`Updated password for existing user`);
    } else {
      // Create new user with temporary password
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return jsonResponse({ error: `Failed to create user: ${createError.message}` }, 500);
      }

      targetUserId = newUser.user.id;
      isNewUser = true;
      console.log(`Created new user: ${targetUserId}`);
    }

    // Check if already has admin role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", targetUserId)
      .single();

    if (existingRole) {
      return jsonResponse({ error: `Este usuário já possui a função: ${existingRole.role}` }, 400);
    }

    // Add admin role
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: targetUserId,
        role: 'admin'
      });

    if (insertError) {
      console.error("Error inserting role:", insertError);
      return jsonResponse({ error: "Failed to add admin role" }, 500);
    }

    console.log(`Admin role added for ${email}`);

    // Send email with temporary password
    let emailSent = false;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const loginUrl = `${req.headers.get("origin") || "https://sonnarjobs.com.br"}/login`;

        const emailResponse = await resend.emails.send({
          from: "Sonnar <noreply@sonnarjobs.com.br>",
          to: [email],
          subject: "Você foi adicionado como Administrador no Sonnar",
          html: renderSonnarEmail({
            preheader: "Acesso de administrador ao painel Sonnar",
            greeting: "Olá.",
            intro:
              "Você foi adicionado como Administrador no painel do Sonnar. A partir de agora, você pode gerenciar assinantes e cadastrar novos clientes.",
            credentials: [
              { label: "E-mail", value: email, highlight: true },
              { label: "Senha provisória", value: tempPassword },
            ],
            cta: { label: "Acessar painel admin", href: loginUrl },
            postCta:
              "Por segurança, no primeiro acesso será solicitada a alteração da senha provisória por uma senha de uso pessoal.",
            signOff: "Atenciosamente,",
            signature: "Equipe Sonnar",
            footnotes: [
              "O painel administrativo concentra a gestão de assinantes, cadastro de clientes e operação da plataforma. Trate suas credenciais como informação confidencial.",
              "Caso você não reconheça esta atribuição de acesso administrativo, solicitamos contato imediato com nossa equipe.",
              "Permanecemos à disposição. Este e-mail aceita resposta direta.",
            ],
          }),
        });

        console.log("Email sent successfully:", emailResponse);
        emailSent = true;
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Continue even if email fails - admin was still created
      }
    } else {
      console.warn("RESEND_API_KEY not configured - email not sent");
    }

    return jsonResponse({
      success: true,
      userId: targetUserId,
      isNewUser,
      emailSent,
      message: emailSent
        ? `Administrador adicionado! Email enviado para ${email} com as credenciais.`
        : `Administrador adicionado! Senha temporária: ${tempPassword} (email não configurado)`
    });
  } catch (error) {
    console.error("Error in add-admin:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});