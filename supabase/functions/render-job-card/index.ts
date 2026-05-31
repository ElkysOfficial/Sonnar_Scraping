// Edge Function — render-job-card
//
// Gera uma imagem PNG 1080x1080 para uma vaga, usando Satori (JSX -> SVG)
// + resvg-wasm (SVG -> PNG). ZERO carga na VPS: tudo roda no Deno do
// Supabase Edge.
//
// Fluxo:
//   1. Recebe { jobId, jobData? } (jobData opcional pra evitar lookup)
//   2. Cache: se job-cards/{jobId}.png ja existe, devolve URL
//   3. Renderiza JSX -> SVG -> PNG
//   4. Sobe pro Storage (bucket public 'job-cards')
//   5. Devolve { url, cached }
//
// Auth: service_role (chamado pelo wa-sender). Sem JWT do user.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import satori from "https://esm.sh/satori@0.10.13";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

// ──────────────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Font loading (Inter, hosted no Google Fonts)
// ──────────────────────────────────────────────────────────────────────

// Satori so aceita TTF/OTF (nao suporta WOFF/WOFF2). jsDelivr serve
// arquivos raw do github via CDN — diferente de github.com/raw que
// retorna HTML wrapper.
const FONT_URLS = {
  regular:
    "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.otf",
  semibold:
    "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-SemiBold.otf",
  bold:
    "https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Bold.otf",
};

let fontCache: { regular: ArrayBuffer; semibold: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [regular, semibold, bold] = await Promise.all([
    fetch(FONT_URLS.regular).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.semibold).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.bold).then((r) => r.arrayBuffer()),
  ]);
  fontCache = { regular, semibold, bold };
  return fontCache;
}

// ──────────────────────────────────────────────────────────────────────
// resvg-wasm init (1x por processo)
// ──────────────────────────────────────────────────────────────────────

let resvgReady = false;
async function ensureResvg() {
  if (resvgReady) return;
  const wasm = await fetch(
    "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm",
  ).then((r) => r.arrayBuffer());
  await initWasm(wasm);
  resvgReady = true;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers de formatação
// ──────────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function pickTitleSize(title: string): number {
  // Auto-resize do titulo conforme o tamanho do texto
  const len = (title || "").length;
  if (len <= 25) return 72;
  if (len <= 40) return 60;
  if (len <= 60) return 52;
  return 44;
}

// ──────────────────────────────────────────────────────────────────────
// JSX do card (Satori)
// ──────────────────────────────────────────────────────────────────────

interface JobCardData {
  job_title: string;
  company?: string;
  location_raw?: string;
  state_code?: string;
  country_code?: string;
  work_type?: string; // Remoto | Hibrido | Presencial
  hiring_regime?: string;
  salary_raw?: string;
  skills?: string[];
  source?: string;
}

// Logo SONNAR — radar SVG embutido (3 aneis + ponta com bolinha) + tagline
function buildBrand() {
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: 16 },
      children: [
        // Radar SVG
        {
          type: "svg",
          props: {
            width: 80,
            height: 80,
            viewBox: "0 0 100 100",
            children: [
              { type: "circle", props: { cx: 50, cy: 50, r: 44, fill: "none", stroke: "#FFFFFF", strokeWidth: 2.5, opacity: 0.95 } },
              { type: "circle", props: { cx: 50, cy: 50, r: 30, fill: "none", stroke: "#FFFFFF", strokeWidth: 2.5, opacity: 0.7 } },
              { type: "circle", props: { cx: 50, cy: 50, r: 14, fill: "none", stroke: "#FFFFFF", strokeWidth: 2.5, opacity: 0.45 } },
              { type: "line", props: { x1: 50, y1: 50, x2: 80, y2: 30, stroke: "#FFFFFF", strokeWidth: 2.5 } },
              { type: "circle", props: { cx: 80, cy: 30, r: 5, fill: "#FFFFFF" } },
            ],
          },
        },
        // SONNAR + tagline empilhados
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", justifyContent: "center" },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 44, fontWeight: 700, color: "#FFFFFF", letterSpacing: 3, lineHeight: 1 },
                  children: "SONNAR",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.82)", letterSpacing: 4, marginTop: 6 },
                  children: "VAGAS DO SEU STACK",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function buildCardJSX(job: JobCardData) {
  const title = truncate(job.job_title || "Vaga sem título", 110);
  const titleSize = pickTitleSize(title);
  const company = truncate(job.company || "", 50);
  const location = truncate(job.location_raw || "", 60);
  const workType = job.work_type || "";
  const stateCode = job.state_code || "";
  const modeLabel = stateCode && workType
    ? `${workType} · ${stateCode}`
    : (workType || stateCode);
  const salary = (job.salary_raw || "").replace(/\s+/g, " ").trim();
  const skills = (job.skills || []).slice(0, 5);

  return {
    type: "div",
    props: {
      style: {
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        padding: 72,
        // Azul vibrante do template (#2563eb topo -> #1e3a8a base)
        background:
          "linear-gradient(180deg, #2563EB 0%, #1D4ED8 45%, #1E40AF 75%, #1E3A8A 100%)",
        color: "#FFFFFF",
        fontFamily: "Inter",
      },
      children: [
        // ─── Top bar: brand + mode ───
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 80,
            },
            children: [
              buildBrand(),
              modeLabel
                ? {
                  type: "div",
                  props: {
                    style: {
                      padding: "12px 20px",
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.20)",
                      borderRadius: 999,
                      fontSize: 20,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      marginTop: 18,
                    },
                    children: modeLabel,
                  },
                }
                : null,
            ].filter(Boolean),
          },
        },

        // ─── Title ───
        {
          type: "div",
          props: {
            style: {
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.08,
              marginBottom: 28,
              color: "#FFFFFF",
            },
            children: title,
          },
        },

        // ─── Company ───
        company
          ? {
            type: "div",
            props: {
              style: {
                fontSize: 32,
                fontWeight: 500,
                color: "rgba(255,255,255,0.92)",
                marginBottom: 18,
              },
              children: company,
            },
          }
          : null,

        // ─── Location ───
        location
          ? {
            type: "div",
            props: {
              style: {
                fontSize: 24,
                color: "rgba(255,255,255,0.78)",
                marginBottom: 40,
              },
              children: location,
            },
          }
          : null,

        // ─── Spacer flex ───
        { type: "div", props: { style: { flex: 1 } } },

        // ─── Salary block ───
        salary
          ? {
            type: "div",
            props: {
              style: {
                padding: "22px 28px",
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 18,
                marginBottom: 32,
                display: "flex",
                flexDirection: "column",
                alignSelf: "flex-start",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: 17,
                      color: "rgba(255,255,255,0.75)",
                      marginBottom: 8,
                      letterSpacing: 0.5,
                    },
                    children: "Faixa salarial",
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { fontSize: 36, fontWeight: 700, color: "#FFFFFF" },
                    children: salary,
                  },
                },
              ],
            },
          }
          : null,

        // ─── Skills chips ───
        skills.length > 0
          ? {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 32,
              },
              children: skills.map((s) => ({
                type: "div",
                props: {
                  style: {
                    padding: "10px 18px",
                    background: "rgba(255,255,255,0.14)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 12,
                    fontSize: 20,
                    fontWeight: 500,
                    color: "#FFFFFF",
                  },
                  children: s,
                },
              })),
            },
          }
          : null,

        // ─── Footer: source ───
        {
          type: "div",
          props: {
            style: {
              fontSize: 18,
              color: "rgba(255,255,255,0.65)",
              borderTop: "1px solid rgba(255,255,255,0.18)",
              paddingTop: 22,
              letterSpacing: 0.5,
            },
            children: job.source
              ? `sonnarjobs.com.br  ·  via ${job.source}`
              : "sonnarjobs.com.br",
          },
        },
      ].filter(Boolean),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Renderiza JSX -> PNG
// ──────────────────────────────────────────────────────────────────────

async function renderCard(job: JobCardData): Promise<Uint8Array> {
  const fonts = await loadFonts();
  await ensureResvg();

  const tree = buildCardJSX(job);
  // satori espera VNode estilo React; o objeto manual { type, props } eh aceito.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1080,
    height: 1080,
    fonts: [
      { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.semibold, weight: 600, style: "normal" },
      { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  const pngData = resvg.render();
  return pngData.asPng();
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let body: { jobId?: string; jobData?: JobCardData; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const jobId = body.jobId;
  if (!jobId) return jsonResponse({ error: "missing_jobId" }, 400);

  const fileName = `${jobId}.png`;

  // 1) Cache: ja existe?
  if (!body.force) {
    const { data: existing } = await admin.storage
      .from("job-cards")
      .list("", { search: fileName, limit: 1 });
    if (existing && existing.length > 0 && existing[0].name === fileName) {
      const { data: pub } = admin.storage
        .from("job-cards")
        .getPublicUrl(fileName);
      return jsonResponse({ url: pub.publicUrl, cached: true });
    }
  }

  // 2) Resolve jobData
  let jobData: JobCardData | null = body.jobData ?? null;
  if (!jobData) {
    const { data, error } = await admin
      .from("jobs")
      .select(
        "job_title,company,location_raw,state_code,country_code,work_type,hiring_regime,salary_raw,skills,source",
      )
      .eq("id", jobId)
      .single();
    if (error || !data) {
      return jsonResponse(
        { error: "job_not_found", details: error?.message },
        404,
      );
    }
    jobData = data as JobCardData;
  }

  // 3) Render
  let png: Uint8Array;
  try {
    png = await renderCard(jobData);
  } catch (err) {
    return jsonResponse(
      { error: "render_failed", details: (err as Error).message },
      500,
    );
  }

  // 4) Upload (upsert pra suportar regeneração via force=true)
  const { error: upErr } = await admin.storage
    .from("job-cards")
    .upload(fileName, png, {
      contentType: "image/png",
      upsert: true,
    });
  if (upErr) {
    return jsonResponse(
      { error: "upload_failed", details: upErr.message },
      500,
    );
  }

  const { data: pub } = admin.storage.from("job-cards").getPublicUrl(fileName);
  return jsonResponse({ url: pub.publicUrl, cached: false });
});
