/**
 * Dados normalizados que o componente JSX consome. O sender ja envia o JSON
 * neste formato no parametro `data`, entao este modulo so valida e completa
 * campos faltantes — nao replica toda a logica de
 * `apps/whatsapp/formatter/src/services/cardGenerator.js#extractJobDataFromEmbed`,
 * que ficou no sender (`captionBuilder.js`) onde ainda e usada pra montar
 * a legenda do WhatsApp.
 */

export interface JobCardData {
  title: string;
  company: string;
  location: string;
  mode: "REMOTO" | "HIBRIDO" | "PRESENCIAL";
  uf: string;
  salary: string;
  salaryNote: string;
  tags: string[];
  source: string;
  date: string;
  time: string;
}

const DEFAULTS: JobCardData = {
  title: "Vaga",
  company: "Confidencial",
  location: "Nao informado",
  mode: "PRESENCIAL",
  uf: "",
  salary: "",
  salaryNote: "",
  tags: [],
  source: "via Sonar",
  date: "",
  time: "",
};

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asMode(v: unknown): JobCardData["mode"] {
  const s = (typeof v === "string" ? v : "").toUpperCase();
  if (s === "REMOTO" || s === "HIBRIDO" || s === "PRESENCIAL") return s;
  return "PRESENCIAL";
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

export function parseJobData(raw: unknown): JobCardData {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  return {
    title: asString(r.title, DEFAULTS.title),
    company: asString(r.company, DEFAULTS.company),
    location: asString(r.location, DEFAULTS.location),
    mode: asMode(r.mode),
    uf: asString(r.uf, DEFAULTS.uf),
    salary: asString(r.salary, DEFAULTS.salary),
    salaryNote: asString(r.salaryNote, DEFAULTS.salaryNote),
    tags: asTags(r.tags),
    source: asString(r.source, DEFAULTS.source),
    date: asString(r.date, DEFAULTS.date),
    time: asString(r.time, DEFAULTS.time),
  };
}
