// resolve-short-link - resolve um código de link curto para a URL de
// destino, registrando o clique. Pública (verify_jwt = false): chamada
// pelo redirect PHP em sonnarjobs.com.br/v/<code>.
//
// Input: GET ?code=<code>
// Output: 200 { url } | 404 { error: 'not_found' } | 4xx/5xx { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!/^[A-Za-z0-9]{1,16}$/.test(code)) {
    return jsonResponse({ error: "invalid_code" }, 400);
  }

  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from("short_links")
      .select("id, target_url, clicks")
      .eq("code", code)
      .maybeSingle();
    if (error) {
      console.error("resolve-short-link select:", error.message);
      return jsonResponse({ error: "db_error" }, 500);
    }
    if (!data) return jsonResponse({ error: "not_found" }, 404);

    // Registra o clique (best-effort; não bloqueia a resolução).
    await supabase
      .from("short_links")
      .update({
        clicks: (data.clicks ?? 0) + 1,
        last_access_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return jsonResponse({ url: data.target_url });
  } catch (e) {
    console.error("resolve-short-link:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
