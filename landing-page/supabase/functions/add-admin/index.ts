import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

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
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #2563EB 0%, #1E40AF 100%); padding: 30px; text-align: center;">
                          <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Acesso de Administrador</h1>
                        </td>
                      </tr>
                      
                      <!-- Content -->
                      <tr>
                        <td style="padding: 30px;">
                          <p style="color: #333; font-size: 16px; margin: 0 0 20px 0;">
                            Olá!
                          </p>
                          
                          <p style="color: #666; font-size: 14px; margin: 0 0 20px 0;">
                            Você foi adicionado como <strong>Administrador</strong> no painel do Sonnar. Agora você pode gerenciar assinantes e cadastrar novos clientes.
                          </p>
                          
                          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <p style="color: #333; font-size: 14px; margin: 0 0 10px 0;"><strong>Seus dados de acesso:</strong></p>
                            <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">
                              <strong>E-mail:</strong> ${email}
                            </p>
                            <p style="color: #666; font-size: 14px; margin: 0;">
                              <strong>Senha temporária:</strong> <code style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${tempPassword}</code>
                            </p>
                          </div>
                          
                          <p style="color: #dc3545; font-size: 13px; margin: 0 0 20px 0;">
                            ⚠️ Por segurança, você precisará trocar sua senha no primeiro acesso.
                          </p>
                          
                          <a href="${loginUrl}" style="display: inline-block; background-color: #2563EB; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            Acessar Painel Admin
                          </a>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="padding: 20px 30px; background-color: #f8f9fa; border-top: 1px solid #e9ecef;">
                          <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                            Sonnar — Vagas de TI personalizadas para você
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
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