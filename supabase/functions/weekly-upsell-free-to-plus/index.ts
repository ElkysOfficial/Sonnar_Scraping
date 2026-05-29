// Supabase Edge Function — weekly upsell Free -> Plus.
//
// Disparado por pg_cron toda segunda 10:00 BRT (13:00 UTC). Para cada
// subscriber elegivel (plan='free', active, cadastrado ha 7+ dias, sem upsell
// recente do canal), monta o pitch personalizado e envia:
//
//   - email via Resend (se subscriber tem email)
//   - WhatsApp via POST /send do sender (se subscriber tem wa_lid)
//
// Auth: Bearer token compartilhado com pg_cron (env CRON_TOKEN). Idempotente:
// se chamada duas vezes no mesmo dia, o RPC list_upsell_free_candidates ja
// filtra quem recebeu nos ultimos 30 dias.
//
// Anti-spam: 1 envio por canal por subscriber a cada 30 dias (rate-limit via
// upsell_log + RPC list_upsell_free_candidates).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderSonnarEmail } from "../_shared/emailTemplate.ts";
import { corsHeaders, jsonResponse } from "../_shared/auth.ts";

const FROM = "Sonnar <noreply@sonnarjobs.com.br>";
const PLUS_CHECKOUT_URL = "https://sonnarjobs.com.br/cadastro/plus";

interface Candidate {
  subscriber_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  wa_lid: string | null;
  created_at: string;
}

interface JobsStats {
  totalWeek: number;
  inGroup: number;
  outsideGroup: number; // = totalWeek - inGroup (vagas Plus exclusivas estimadas)
  sampleTitles: string[];
}

// ──────────────────────────────────────────────────────────────────────
// Stats: vagas dos ultimos 7 dias (usadas no pitch personalizado)
// ──────────────────────────────────────────────────────────────────────

async function fetchJobsStats(admin: ReturnType<typeof createClient>): Promise<JobsStats> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("jobs")
    .select("id, title", { count: "exact" })
    .gte("created_at", since)
    .limit(3);

  if (error) {
    return { totalWeek: 0, inGroup: 0, outsideGroup: 0, sampleTitles: [] };
  }
  const total = data?.length ?? 0;
  // Heuristica: grupo publico ve ~30% do total (vagas "core"). 70% sao Plus.
  // Em prod real, ajustar com base em metricas reais de envio.
  const inGroup = Math.floor(total * 0.3);
  return {
    totalWeek: total,
    inGroup,
    outsideGroup: total - inGroup,
    sampleTitles: (data || []).slice(0, 3).map((j) => j.title || "Vaga"),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Template de email
// ──────────────────────────────────────────────────────────────────────

function buildEmailHtml(candidate: Candidate, stats: JobsStats): string {
  const firstName = (candidate.name || "").split(" ")[0] || "voce";
  const sampleList =
    stats.sampleTitles.length > 0
      ? stats.sampleTitles.map((t) => `• ${t}`).join("<br>")
      : "Senior Backend, Frontend Pleno, DevOps Engineer";

  return renderSonnarEmail({
    preheader: `${stats.outsideGroup} vagas foram pra DM privada esta semana — voce nao recebeu`,
    greeting: `Oi, ${firstName}!`,
    intro:
      `Esta semana publicamos <strong>${stats.totalWeek} vagas</strong> no Sonnar. ` +
      `Apenas <strong>${stats.inGroup}</strong> apareceram no grupo publico do WhatsApp ` +
      `— as outras <strong>${stats.outsideGroup}</strong> foram direto pra DM dos assinantes Plus.<br><br>` +
      `Exemplos do que voce perdeu esta semana:<br>` +
      `<em>${sampleList}</em>`,
    cta: { label: "Ativar Plus por R$ 10/mes (7 dias gratis)", href: PLUS_CHECKOUT_URL },
    postCta:
      `<strong>O que muda no Plus:</strong><br>` +
      `✓ Vagas no seu privado, filtradas pelo seu stack<br>` +
      `✓ Match score 0-100 com ✓/✗ por skill (feature nova)<br>` +
      `✓ Upload de curriculo + analise por IA (em breve)<br>` +
      `✓ Estatisticas pessoais no dashboard<br>` +
      `<br>Cancele quando quiser. 7 dias gratis pra testar.`,
    footnotes: [
      "Voce esta recebendo este email porque tem cadastro Free ativo no Sonnar. " +
        "Se nao quiser mais receber comunicacoes promocionais, responda este email com 'sair'.",
    ],
    signOff: "Boa sorte!",
    signature: "Equipe Sonnar",
  });
}

function buildWhatsappText(candidate: Candidate, stats: JobsStats): string {
  const firstName = (candidate.name || "").split(" ")[0] || "voce";
  const lines = [
    `Oi ${firstName}! 👋`,
    "",
    `Esta semana publicamos *${stats.totalWeek} vagas* no Sonnar.`,
    `Apenas ${stats.inGroup} apareceram no grupo publico — as outras *${stats.outsideGroup}* foram direto pra DM dos assinantes *Plus*.`,
    "",
    "🎯 *Plus = R$ 10/mes:*",
    "✓ Vagas no seu privado, filtradas pelo seu stack",
    "✓ Match score 0-100 com ✓/✗ por skill (feature nova)",
    "✓ Upload de CV + analise por IA (em breve)",
    "✓ 7 dias gratis",
    "",
    `🔗 Ativar agora: ${PLUS_CHECKOUT_URL}`,
    "",
    "_Se nao quiser mais receber promocoes, responda com 'sair'._",
  ];
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────
// Senders
// ──────────────────────────────────────────────────────────────────────

async function sendEmail(
  resend: Resend,
  candidate: Candidate,
  stats: JobsStats
): Promise<{ ok: boolean; error?: string }> {
  if (!candidate.email) return { ok: false, error: "no_email" };
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: candidate.email,
      subject: `${stats.outsideGroup} vagas que voce perdeu esta semana no Sonnar`,
      html: buildEmailHtml(candidate, stats),
    });
    if (error) return { ok: false, error: error.message || "resend_error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendWhatsapp(
  candidate: Candidate,
  stats: JobsStats
): Promise<{ ok: boolean; error?: string }> {
  if (!candidate.wa_lid) return { ok: false, error: "no_wa_lid" };
  const senderUrl = Deno.env.get("SENDER_API_URL");
  const senderToken = Deno.env.get("SENDER_API_TOKEN");
  if (!senderUrl || !senderToken) {
    return { ok: false, error: "sender_not_configured" };
  }
  try {
    const text = buildWhatsappText(candidate, stats);
    const res = await fetch(`${senderUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${senderToken}`,
      },
      body: JSON.stringify({ to: candidate.wa_lid, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, error: `sender_http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function logUpsell(
  admin: ReturnType<typeof createClient>,
  subscriberId: string,
  channel: "email" | "whatsapp",
  status: "sent" | "failed" | "skipped",
  metadata: Record<string, unknown>,
  errorMsg?: string
): Promise<void> {
  await admin.from("upsell_log").insert({
    subscriber_id: subscriberId,
    channel,
    status,
    campaign: "free_to_plus_weekly",
    metadata,
    error_message: errorMsg || null,
  });
}

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

  // Auth: Bearer token compartilhado com pg_cron
  const expected = Deno.env.get("CRON_TOKEN");
  if (!expected) {
    return jsonResponse({ error: "cron_token_not_configured" }, 500);
  }
  const got = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (got !== expected) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return jsonResponse({ error: "resend_key_not_configured" }, 500);
  }
  const resend = new Resend(resendKey);

  // Stats globais (uma chamada, reaproveitada pra todos os candidatos)
  const stats = await fetchJobsStats(admin);

  // Resultado consolidado
  const summary = {
    email: { eligible: 0, sent: 0, failed: 0 },
    whatsapp: { eligible: 0, sent: 0, failed: 0 },
    stats,
  };

  // EMAIL channel
  const { data: emailCandidates, error: emailError } = await admin.rpc(
    "list_upsell_free_candidates",
    { p_channel: "email" }
  );
  if (emailError) {
    console.error("[upsell] erro ao listar candidatos email:", emailError);
  } else {
    summary.email.eligible = emailCandidates?.length || 0;
    for (const c of (emailCandidates || []) as Candidate[]) {
      const result = await sendEmail(resend, c, stats);
      if (result.ok) {
        summary.email.sent++;
        await logUpsell(admin, c.subscriber_id, "email", "sent", { stats });
      } else {
        summary.email.failed++;
        await logUpsell(admin, c.subscriber_id, "email", "failed", { stats }, result.error);
      }
    }
  }

  // WHATSAPP channel
  const { data: waCandidates, error: waError } = await admin.rpc(
    "list_upsell_free_candidates",
    { p_channel: "whatsapp" }
  );
  if (waError) {
    console.error("[upsell] erro ao listar candidatos whatsapp:", waError);
  } else {
    summary.whatsapp.eligible = waCandidates?.length || 0;
    for (const c of (waCandidates || []) as Candidate[]) {
      const result = await sendWhatsapp(c, stats);
      if (result.ok) {
        summary.whatsapp.sent++;
        await logUpsell(admin, c.subscriber_id, "whatsapp", "sent", { stats });
      } else {
        summary.whatsapp.failed++;
        await logUpsell(admin, c.subscriber_id, "whatsapp", "failed", { stats }, result.error);
      }
    }
  }

  console.log("[upsell] resumo:", JSON.stringify(summary));
  return jsonResponse({ success: true, summary });
});
