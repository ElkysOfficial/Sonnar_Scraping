/**
 * Card 1080x1080 da vaga. JSX -> Satori -> SVG -> Resvg -> PNG.
 *
 * Satori implementa um subset de CSS: flexbox, gradients, border-radius, basic
 * typography. Nao tem `position: absolute` confiavel em todo lugar nem
 * pseudo-elementos. Layout aqui e 100% flex.
 *
 * Paleta e proporcoes vem do card antigo (apps/whatsapp/formatter/src/services/cardGenerator.js)
 * mais a referencia visual em apps/whatsapp/formatter/samples/job-card-preview.png.
 */

import type { JobCardData } from "../extractor.js";

const COLORS = {
  bgDark: "#061520",
  bgMid: "#0A2540",
  bgLight: "#0D4880",
  white: "#FFFFFF",
  textPrimary: "rgba(255,255,255,0.95)",
  textSecondary: "rgba(255,255,255,0.75)",
  textMuted: "rgba(255,255,255,0.55)",
  accent: "#60A5FA",
  border: "rgba(255,255,255,0.08)",
  chipBg: "rgba(255,255,255,0.04)",
  chipBorder: "rgba(255,255,255,0.10)",
  modeBg: "rgba(0,0,0,0.2)",
  blockBg: "rgba(0,0,0,0.18)",
} as const;

/**
 * Tipografia adaptativa do titulo: como Satori nao expoe measureText, usamos
 * heuristica por comprimento. Limiares calibrados pra Inter SemiBold em
 * largura util de ~870px (1080 - 2*72 - sidebar do salario).
 */
function titleFontSize(title: string): number {
  const len = title.length;
  if (len <= 28) return 68;
  if (len <= 42) return 58;
  if (len <= 60) return 48;
  return 42;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function JobCard({ data, assetsOrigin }: { data: JobCardData; assetsOrigin: string }) {
  const titleSize = titleFontSize(data.title);
  const modeLabel = data.uf ? `${data.mode} · ${data.uf}` : data.mode;
  const hasSalary = data.salary && data.salary !== "Nao informado";
  const company = truncate(data.company, 36);
  const location = truncate(data.location, 38);
  const chips = data.tags.slice(0, 5);

  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        backgroundImage: `linear-gradient(135deg, ${COLORS.bgDark} 0%, ${COLORS.bgMid} 50%, ${COLORS.bgLight} 100%)`,
        padding: "56px 72px 48px 72px",
        fontFamily: "Inter",
        color: COLORS.white,
        position: "relative",
      }}
    >
      {/* Top row: brand + mode label */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <Brand />
        <ModeChip label={modeLabel} />
      </div>

      {/* Salary block (right aligned) */}
      {hasSalary && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 32,
          }}
        >
          <SalaryBlock value={data.salary} note={data.salaryNote} />
        </div>
      )}

      {/* Title */}
      <div
        style={{
          display: "flex",
          marginTop: hasSalary ? 24 : 56,
          maxWidth: hasSalary ? 720 : 940,
          fontSize: titleSize,
          fontWeight: 600,
          lineHeight: 1.12,
          color: COLORS.white,
        }}
      >
        {data.title}
      </div>

      {/* Company */}
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 32,
          fontWeight: 400,
          color: COLORS.textSecondary,
        }}
      >
        {company}
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 32,
            maxWidth: 870,
          }}
        >
          {chips.map((tag, i) => (
            <Chip key={`${tag}-${i}`} label={tag} />
          ))}
        </div>
      )}

      {/* Separator */}
      <div
        style={{
          display: "flex",
          marginTop: 40,
          width: "100%",
          height: 1,
          backgroundColor: COLORS.border,
        }}
      />

      {/* Location row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 24,
        }}
      >
        <img
          src={`${assetsOrigin}/icons/pin.png`}
          width={22}
          height={22}
          style={{ opacity: 0.9 }}
        />
        <span style={{ fontSize: 28, fontWeight: 600, color: COLORS.textPrimary }}>
          {location}
        </span>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          fontSize: 16,
          fontWeight: 500,
          color: COLORS.textMuted,
          letterSpacing: 0.8,
        }}
      >
        <span>{data.source.toLowerCase()}</span>
        <span>{data.date && data.time ? `${data.date} · ${data.time}` : data.date || data.time}</span>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundImage: `linear-gradient(135deg, #FFFFFF 0%, #C5E1FF 100%)`,
          color: COLORS.bgDark,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        S
      </div>
      <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 1, color: COLORS.white }}>
        SONNAR
      </div>
    </div>
  );
}

function ModeChip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: 10,
        backgroundColor: COLORS.modeBg,
        border: `1px solid ${COLORS.border}`,
        color: COLORS.accent,
        fontSize: 16,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "9px 14px",
        borderRadius: 10,
        backgroundColor: COLORS.chipBg,
        border: `1px solid ${COLORS.chipBorder}`,
        color: COLORS.textSecondary,
        fontSize: 17,
        fontWeight: 500,
      }}
    >
      {label}
    </div>
  );
}

function SalaryBlock({ value, note }: { value: string; note: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "14px 18px",
        borderRadius: 14,
        backgroundColor: COLORS.blockBg,
        border: `1px solid ${COLORS.border}`,
        maxWidth: 480,
      }}
    >
      <div style={{ display: "flex", fontSize: 16, fontWeight: 500, color: COLORS.textSecondary }}>
        Faixa salarial
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 28, fontWeight: 700, color: COLORS.white }}>
        {value}
      </div>
      {note && (
        <div style={{ display: "flex", marginTop: 8, fontSize: 16, fontWeight: 400, color: COLORS.textSecondary }}>
          {note}
        </div>
      )}
    </div>
  );
}
