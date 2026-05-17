import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/auth.ts";

// link-whatsapp: chamada pelo microservico do WhatsApp (NAO pelo frontend).
//
// O bot recebe "parear <token>" de um assinante. A mensagem carrega o LID
// do WhatsApp; o token identifica QUAL assinante eh. Esta funcao valida o
// token, grava o LID em subscriber_profiles e devolve o perfil de busca
// para o bot montar os filtros de vagas VIP.
//
// Autenticada por um segredo compartilhado (header x-link-secret), nao por
// JWT de usuario - por isso verify_jwt = false no config.toml.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const expectedSecret = Deno.env.get("WHATSAPP_LINK_SECRET");
    if (!expectedSecret) {
      console.error("link-whatsapp: WHATSAPP_LINK_SECRET nao configurado");
      return jsonResponse({ error: "service_not_configured" }, 500);
    }

    if (req.headers.get("x-link-secret") !== expectedSecret) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim().toUpperCase() : "";
    const lid = typeof body?.lid === "string" ? body.lid.trim() : "";

    if (!token || !lid) {
      return jsonResponse({ error: "missing_token_or_lid" }, 400);
    }

    const admin = getAdminClient();

    // Localiza o perfil pelo token de pareamento.
    const { data: profile, error: profileError } = await admin
      .from("subscriber_profiles")
      .select("id, subscriber_id, stack, areas, seniority, work_models, location, min_salary, wa_lid")
      .eq("wa_link_token", token)
      .maybeSingle();

    if (profileError) {
      console.error("link-whatsapp: erro ao buscar profile", profileError);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    // Token nao encontrado = invalido ou ja usado (limpo apos vincular).
    if (!profile) {
      return jsonResponse({ error: "invalid_or_used_token" }, 404);
    }

    const { data: subscriber, error: subError } = await admin
      .from("subscribers")
      .select("name, surname, plan, status")
      .eq("id", profile.subscriber_id)
      .single();

    if (subError || !subscriber) {
      console.error("link-whatsapp: subscriber nao encontrado", subError);
      return jsonResponse({ error: "subscriber_not_found" }, 404);
    }

    // Grava o LID e encerra o token (uso unico).
    const { error: updateError } = await admin
      .from("subscriber_profiles")
      .update({
        wa_lid: lid,
        wa_linked_at: new Date().toISOString(),
        wa_link_token: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("link-whatsapp: erro ao gravar wa_lid", updateError);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    const fullName = [subscriber.name, subscriber.surname].filter(Boolean).join(" ").trim();

    return jsonResponse({
      ok: true,
      subscriber: {
        name: fullName || subscriber.name,
        plan: subscriber.plan,
        stack: profile.stack ?? [],
        areas: profile.areas ?? [],
        seniority: profile.seniority ?? null,
        work_models: profile.work_models ?? [],
        location: profile.location ?? null,
        min_salary: profile.min_salary ?? null,
      },
    });
  } catch (error) {
    console.error("link-whatsapp error:", error);
    const message = error instanceof Error ? error.message : "internal_error";
    return jsonResponse({ error: message }, 500);
  }
});
