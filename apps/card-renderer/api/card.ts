/**
 * GET /api/card?data=<base64url-json>&token=<hmac>
 *
 * Renderiza um card 1080x1080 da vaga via @vercel/og. Resposta cacheada
 * pela CDN da Vercel por 1 ano (URL contem o token, que e deterministico
 * por payload, entao mesmo job = mesma URL = HIT CDN).
 *
 * Roda no Edge Runtime (V8 isolate). Sem `fs`, sem `node:crypto`, sem deps
 * nativas.
 */

import { ImageResponse } from "@vercel/og";
import { JobCard } from "../lib/components/JobCard.js";
import { parseJobData } from "../lib/extractor.js";
import { loadInterFonts } from "../lib/fonts.js";
import { verify } from "../lib/token.js";

export const config = { runtime: "edge" };

function decodeBase64Url(input: string): string {
  // base64url -> base64 padrao
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return atob(b64 + pad);
}

function badRequest(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    const token = url.searchParams.get("token");

    if (!data) return badRequest("Missing 'data' query param");
    if (!token) return badRequest("Missing 'token' query param", 401);

    const secret = process.env.CARD_RENDERER_SECRET;
    if (!secret) {
      return badRequest("Server misconfigured: CARD_RENDERER_SECRET not set", 500);
    }

    const ok = await verify(data, token, secret);
    if (!ok) return badRequest("Invalid token", 401);

    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeBase64Url(data));
    } catch {
      return badRequest("Malformed 'data' (must be base64url JSON)");
    }

    const job = parseJobData(parsed);
    const origin = url.origin;
    const fonts = await loadInterFonts();

    return new ImageResponse(<JobCard data={job} assetsOrigin={origin} />, {
      width: 1080,
      height: 1080,
      fonts: fonts.map((f) => ({
        name: f.name,
        data: f.data,
        weight: f.weight,
        style: f.style,
      })),
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Render failed", details: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
