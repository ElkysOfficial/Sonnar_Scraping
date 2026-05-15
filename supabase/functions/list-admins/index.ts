import { authorize, corsHeaders, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await authorize(req, ["owner"]);
    if (auth instanceof Response) return auth;
    const { admin } = auth;

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .in("role", ["owner", "admin"])
      .order("created_at", { ascending: true });

    if (rolesError) throw rolesError;
    if (!roles || roles.length === 0) {
      return jsonResponse({ admins: [] });
    }

    const { data: usersData, error: usersError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw usersError;

    const userMap = new Map(usersData.users.map((u) => [u.id, u.email]));

    const admins = roles.map((role) => ({
      id: role.id,
      user_id: role.user_id,
      email: userMap.get(role.user_id) ?? "Email não encontrado",
      role: role.role,
      created_at: role.created_at,
    }));

    return jsonResponse({ admins });
  } catch (error: unknown) {
    console.error("Error in list-admins:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    return jsonResponse({ error: message }, 500);
  }
});
