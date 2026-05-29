/**
 * Carrega Inter como ArrayBuffer pra passar ao Satori via `options.fonts`.
 *
 * Buscamos direto do Google Fonts (URL estavel, hospedagem do Google, gratis,
 * cacheado pela CDN da Vercel apos a primeira invocacao). Evita commitar
 * binarios .ttf no repo e nao depende de assets servidos pelo proprio
 * dominio (cards.sonnarjobs.com.br pode estar no meio de DNS swap sem
 * quebrar render).
 *
 * Edge runtime nao tem `fs` — `fetch` e o caminho oficial.
 */

export type FontWeight = 400 | 500 | 600 | 700;

interface FontDef {
  name: "Inter";
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
}

// URLs diretas do TTF hospedadas pelo Google. Versoes pinadas pra evitar
// que uma atualizacao silenciosa do Google mude o render.
const FONT_URLS: Record<FontWeight, string> = {
  400: "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Regular.ttf",
  500: "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Medium.ttf",
  600: "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-SemiBold.ttf",
  700: "https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Bold.ttf",
};

let cached: FontDef[] | null = null;

async function loadOne(weight: FontWeight): Promise<FontDef> {
  const url = FONT_URLS[weight];
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Falha ao carregar Inter ${weight}: ${res.status}`);
  }
  const data = await res.arrayBuffer();
  return { name: "Inter", data, weight, style: "normal" };
}

export async function loadInterFonts(): Promise<FontDef[]> {
  if (cached) return cached;
  cached = await Promise.all([loadOne(400), loadOne(500), loadOne(600), loadOne(700)]);
  return cached;
}
