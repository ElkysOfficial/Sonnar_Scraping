// Helpers compartilhados para autenticação/autorização nas edge functions.
// Centraliza checagem de papel (admin/owner) para evitar duplicação.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type AppRole = "owner" | "admin";

export interface AuthedUser {
  id: string;
  email: string | null;
  role: AppRole | null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// Resolve quem chamou e qual o papel. Falha com 401 se não autenticado.
// `requiredRoles` opcional: ['owner'] | ['owner','admin']. Se vazio, qualquer
// authenticated passa.
export async function authorize(
  req: Request,
  requiredRoles?: AppRole[]
): Promise<{ user: AuthedUser; admin: SupabaseClient } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = getAdminClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const user = userData.user;

  // Bootstrap: o owner pode ser identificado por OWNER_EMAIL antes mesmo de
  // ter user_roles (caso útil só para o primeiro provisionamento).
  const ownerEmail = Deno.env.get("OWNER_EMAIL")?.toLowerCase();
  let role: AppRole | null = null;
  if (ownerEmail && user.email?.toLowerCase() === ownerEmail) {
    role = "owner";
  } else {
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role === "owner" || roleRow?.role === "admin") {
      role = roleRow.role as AppRole;
    }
  }

  if (requiredRoles && requiredRoles.length > 0) {
    if (!role || !requiredRoles.includes(role)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
  }

  return {
    user: { id: user.id, email: user.email ?? null, role },
    admin,
  };
}
