/**
 * HMAC-SHA256 do payload (string base64url) com o segredo compartilhado.
 *
 * O mesmo segredo (`CARD_RENDERER_SECRET`) precisa estar configurado no
 * sender da VPS — la o token e gerado, aqui ele e verificado. Sem esse
 * gate qualquer um conseguiria invocar a Edge Function com payload arbitrario
 * e queimar a quota gratis da Vercel.
 *
 * Edge runtime tem `crypto.subtle` nativo (Web Crypto API). Nao usamos
 * `node:crypto` aqui — funcionaria localmente mas quebraria no deploy.
 */

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToHex(sig);
}

/**
 * Comparacao em tempo constante pra evitar timing attacks. Edge runtime nao
 * tem `crypto.timingSafeEqual`, entao fazemos manualmente.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verify(
  payload: string,
  token: string,
  secret: string
): Promise<boolean> {
  if (!payload || !token || !secret) return false;
  const expected = await sign(payload, secret);
  return constantTimeEqual(expected, token);
}
