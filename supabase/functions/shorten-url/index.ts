// shorten-url - cria (ou reaproveita) um link curto sonnarjobs.com.br/v/<code>
// para uma URL. Usado pelos formatters ao montar as mensagens de vaga.
//
// Autenticada por segredo compartilhado (header x-link-secret). Requer
// verify_jwt = false no config.toml.
//
// Input (JSON): { url }
// Output: 200 { shortUrl, code } | 4xx/5xx { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateCode(len = 7): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let code = "";
  for (let i = 0; i < len; i++) code += ALPHABET[buf[i] % ALPHABET.length];
  return code;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("WHATSAPP_LINK_SECRET");
  if (!expectedSecret) {
    console.error("shorten-url: WHATSAPP_LINK_SECRET nao configurado");
    return jsonResponse({ error: "service_not_configured" }, 500);
  }
  if (req.headers.get("x-link-secret") !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\/.+/i.test(url)) {
    return jsonResponse({ error: "invalid_url" }, 400);
  }

  const baseUrl = (Deno.env.get("SITE_URL") ?? "https://sonnarjobs.com.br").replace(/\/$/, "");
  const supabase = getAdminClient();

  try {
    // Reaproveita o código se a URL já foi encurtada antes.
    const { data: existing } = await supabase
      .from("short_links")
      .select("code")
      .eq("target_url", url)
      .maybeSingle();
    if (existing?.code) {
      return jsonResponse({ shortUrl: `${baseUrl}/v/${existing.code}`, code: existing.code });
    }

    // Gera um código único (até 5 tentativas em caso de colisão).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await supabase
        .from("short_links")
        .insert({ code, target_url: url });
      if (!error) {
        return jsonResponse({ shortUrl: `${baseUrl}/v/${code}`, code });
      }
      // 23505 = unique_violation: colisão de code OU corrida no target_url
      // (outra requisição criou o mesmo destino em paralelo).
      if (error.code === "23505") {
        const { data: row } = await supabase
          .from("short_links")
          .select("code")
          .eq("target_url", url)
          .maybeSingle();
        if (row?.code) {
          return jsonResponse({ shortUrl: `${baseUrl}/v/${row.code}`, code: row.code });
        }
        continue; // colisão de code: tenta outro
      }
      console.error("shorten-url insert:", error.message);
      return jsonResponse({ error: "db_error" }, 500);
    }
    return jsonResponse({ error: "code_generation_failed" }, 500);
  } catch (e) {
    console.error("shorten-url:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
