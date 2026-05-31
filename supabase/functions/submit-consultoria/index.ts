// Edge Function — submit-consultoria (v3.10.32)
//
// Fluxo:
//   1. Frontend (dashboard Sonnar Plus) sobe CV (opcional) pro Storage
//      bucket `consultoria-cvs/<subscriber_id>/<uuid>.pdf`
//   2. Frontend chama esta funcao com { subscriberId, linkedinUrl, objetivo,
//      vagaAlvoUrl?, cvFilePath?, cvFileName?, cvFileSize? }
//   3. Funcao valida plano Plus, insere row em `consultoria_requests`,
//      gera signed URL do CV (7 dias) e notifica admin via WhatsApp
//   4. Devolve { id, createdAt }
//
// Auth: JWT do Supabase Auth. Apenas plano Plus.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/auth.ts";

interface SubmitRequest {
  subscriberId: string;
  linkedinUrl: string;
  objetivo: string;
  vagaAlvoUrl?: string;
  cvFilePath?: string;
  cvFileName?: string;
  cvFileSize?: number;
}

// Notifica admin via WhatsApp (POST /send do wa-sender).
async function notifyAdmin(payload: {
  subscriberName: string | null;
  subscriberEmail: string | null;
  linkedinUrl: string;
  objetivo: string;
  vagaAlvoUrl?: string;
  cvSignedUrl?: string;
  requestId: string;
}): Promise<void> {
  const senderUrl = Deno.env.get("SENDER_API_URL");
  const senderToken = Deno.env.get("SENDER_API_TOKEN");
  const ownerLid = Deno.env.get("OWNER_LID") || "120152280592452@lid";
  if (!senderUrl || !senderToken) {
    console.warn("[submit-consultoria] SENDER_API_URL/TOKEN nao configurados; pulando notificacao");
    return;
  }

  const lines: string[] = [];
  lines.push("*🎯 Novo pedido de consultoria*");
  lines.push("");
  if (payload.subscriberName) lines.push(`*Cliente:* ${payload.subscriberName}`);
  if (payload.subscriberEmail) lines.push(`*Email:* ${payload.subscriberEmail}`);
  lines.push(`*LinkedIn:* ${payload.linkedinUrl}`);
  if (payload.vagaAlvoUrl) lines.push(`*Vaga-alvo:* ${payload.vagaAlvoUrl}`);
  lines.push("");
  lines.push("*Objetivo:*");
  lines.push(payload.objetivo);
  if (payload.cvSignedUrl) {
    lines.push("");
    lines.push(`*CV:* ${payload.cvSignedUrl}`);
  }
  lines.push("");
  lines.push(`_ID: ${payload.requestId.slice(0, 8)}_`);
  lines.push(`_Pra agendar: /consultoria ${payload.requestId.slice(0, 8)} agendar DD/MM HH:MM_`);

  try {
    const res = await fetch(`${senderUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderToken}`,
      },
      body: JSON.stringify({ to: ownerLid, text: lines.join("\n") }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[submit-consultoria] sender http ${res.status}`);
    }
  } catch (err) {
    console.error(`[submit-consultoria] sender error: ${(err as Error).message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: SubmitRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  // Validacoes minimas
  if (!body.subscriberId || !body.linkedinUrl || !body.objetivo) {
    return jsonResponse(
      { error: "missing_fields", required: ["subscriberId", "linkedinUrl", "objetivo"] },
      400
    );
  }
  if (!/^https?:\/\/(www\.)?linkedin\.com\//i.test(body.linkedinUrl)) {
    return jsonResponse({ error: "invalid_linkedin_url" }, 400);
  }
  if (body.objetivo.length < 10 || body.objetivo.length > 2000) {
    return jsonResponse({ error: "objetivo_length", min: 10, max: 2000 }, 400);
  }
  if (body.vagaAlvoUrl && !/^https?:\/\//i.test(body.vagaAlvoUrl)) {
    return jsonResponse({ error: "invalid_vaga_url" }, 400);
  }

  // Valida subscriber + plano Plus
  const { data: sub, error: subErr } = await admin
    .from("subscribers")
    .select("id, user_id, plan, name, email")
    .eq("id", body.subscriberId)
    .single();

  if (subErr || !sub) {
    return jsonResponse({ error: "subscriber_not_found" }, 404);
  }
  if (sub.user_id !== userData.user.id) {
    return jsonResponse({ error: "forbidden" }, 403);
  }
  if (sub.plan !== "plus") {
    return jsonResponse(
      { error: "plan_not_eligible", message: "Consultoria e exclusiva do plano Plus." },
      402
    );
  }

  // Insere o pedido
  const { data: created, error: insErr } = await admin
    .from("consultoria_requests")
    .insert({
      subscriber_id: body.subscriberId,
      linkedin_url: body.linkedinUrl.trim(),
      objetivo: body.objetivo.trim(),
      vaga_alvo_url: body.vagaAlvoUrl?.trim() || null,
      cv_file_path: body.cvFilePath || null,
      cv_file_name: body.cvFileName || null,
      cv_file_size: body.cvFileSize || null,
      status: "pending",
    })
    .select("id, created_at")
    .single();

  if (insErr || !created) {
    return jsonResponse(
      { error: "insert_failed", details: insErr?.message || "unknown" },
      500
    );
  }

  // Se tem CV, gera signedUrl de 7 dias pro admin
  let cvSignedUrl: string | undefined;
  if (body.cvFilePath) {
    const { data: signed } = await admin.storage
      .from("consultoria-cvs")
      .createSignedUrl(body.cvFilePath, 60 * 60 * 24 * 7);
    cvSignedUrl = signed?.signedUrl;
  }

  // Notifica admin (fire-and-forget — nao bloqueia o response)
  notifyAdmin({
    subscriberName: sub.name ?? null,
    subscriberEmail: sub.email ?? null,
    linkedinUrl: body.linkedinUrl,
    objetivo: body.objetivo,
    vagaAlvoUrl: body.vagaAlvoUrl,
    cvSignedUrl,
    requestId: created.id,
  }).catch((err) => console.error(`[submit-consultoria] notify error: ${err.message}`));

  return jsonResponse({
    ok: true,
    id: created.id,
    createdAt: created.created_at,
  });
});
