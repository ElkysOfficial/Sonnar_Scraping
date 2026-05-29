// Edge Function — parse-resume
//
// Fluxo:
//   1. Frontend sobe PDF/DOCX pro Storage bucket `resumes/<subscriber_id>/<uuid>.<ext>`
//   2. Frontend chama esta funcao com { subscriberId, filePath, fileName, fileMime, fileSize }
//   3. Funcao baixa o arquivo do Storage, extrai texto (pdf.js / mammoth)
//   4. Roda parser deterministico (regex + vocabulario)
//   5. Insere/atualiza linha em `subscriber_resumes` (is_active=true,
//      trigger desativa os antigos)
//   6. Devolve { id, skills, yearsTotal, seniority, languages, textLength }
//
// Auth: usuario autenticado (JWT supabase). O subscriber_id e validado contra
// o auth_user_id da tabela subscribers.
//
// Custo: zero LLM. Apenas CPU do Edge Function (Deno).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// pdfjs serverless build pra Deno
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import { corsHeaders, jsonResponse } from "../_shared/auth.ts";
import { parseResumeText, PARSER_VERSION } from "../_shared/resumeParser.ts";

interface ParseRequest {
  subscriberId: string;
  filePath: string;       // resumes/<sub_id>/<uuid>.<ext>
  fileName?: string;
  fileMime: string;       // application/pdf | docx mime
  fileSize?: number;
}

// ──────────────────────────────────────────────────────────────────────
// Extracao de texto
// ──────────────────────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // deno-lint-ignore no-explicit-any
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(pageText);
  }
  return pages.join("\n\n");
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}

const MIME_TO_EXTRACTOR: Record<string, (buf: ArrayBuffer) => Promise<string>> = {
  "application/pdf": extractPdfText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": extractDocxText,
};

// ──────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Auth do usuario chamador (JWT do Supabase Auth)
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

  // Parse body
  let body: ParseRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (!body.subscriberId || !body.filePath || !body.fileMime) {
    return jsonResponse(
      { error: "missing_fields", required: ["subscriberId", "filePath", "fileMime"] },
      400
    );
  }

  // Valida que o subscriber pertence ao usuario autenticado
  const { data: sub, error: subErr } = await admin
    .from("subscribers")
    .select("id, auth_user_id, plan")
    .eq("id", body.subscriberId)
    .single();

  if (subErr || !sub) {
    return jsonResponse({ error: "subscriber_not_found" }, 404);
  }
  if (sub.auth_user_id !== userData.user.id) {
    return jsonResponse({ error: "forbidden" }, 403);
  }
  if (sub.plan !== "plus") {
    return jsonResponse(
      { error: "plan_not_eligible", message: "Upload de curriculo e feature do plano Plus." },
      402
    );
  }

  // Valida mime
  const extractor = MIME_TO_EXTRACTOR[body.fileMime];
  if (!extractor) {
    return jsonResponse(
      { error: "unsupported_mime", supported: Object.keys(MIME_TO_EXTRACTOR) },
      400
    );
  }

  // Insere registro pending (placeholder)
  const { data: pending, error: insErr } = await admin
    .from("subscriber_resumes")
    .insert({
      subscriber_id: body.subscriberId,
      file_path: body.filePath,
      file_name: body.fileName || null,
      file_size: body.fileSize || null,
      file_mime: body.fileMime,
      parser_version: PARSER_VERSION,
      parse_status: "pending",
      is_active: true,
    })
    .select("id")
    .single();

  if (insErr || !pending) {
    return jsonResponse(
      { error: "insert_failed", details: insErr?.message || "unknown" },
      500
    );
  }

  // Baixa arquivo do Storage
  try {
    const { data: blob, error: dlErr } = await admin.storage
      .from("resumes")
      .download(body.filePath);
    if (dlErr || !blob) throw new Error(dlErr?.message || "download_failed");

    const buffer = await blob.arrayBuffer();
    const text = await extractor(buffer);
    const parsed = parseResumeText(text);

    // Atualiza o registro com o resultado
    await admin
      .from("subscriber_resumes")
      .update({
        raw_text: text.slice(0, 100000), // teto 100KB pra nao inflar a tabela
        extracted_skills: parsed.skills,
        years_total: parsed.yearsTotal,
        seniority: parsed.seniority,
        languages: parsed.languages,
        parse_status: "done",
        parsed_at: new Date().toISOString(),
        parse_metadata: {
          text_length: parsed.textLength,
          skill_matches_count: parsed.skills.length,
          parser_version: PARSER_VERSION,
        },
      })
      .eq("id", pending.id);

    return jsonResponse({
      success: true,
      id: pending.id,
      skills: parsed.skills,
      yearsTotal: parsed.yearsTotal,
      seniority: parsed.seniority,
      languages: parsed.languages,
      textLength: parsed.textLength,
    });
  } catch (err) {
    const msg = (err as Error).message || "parse_failed";
    await admin
      .from("subscriber_resumes")
      .update({
        parse_status: "failed",
        parse_error: msg,
        parsed_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
    return jsonResponse({ error: "parse_failed", details: msg }, 500);
  }
});
