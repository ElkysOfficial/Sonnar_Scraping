#!/usr/bin/env node
/**
 * Gera uma URL assinada pra testar o endpoint /api/card localmente ou em prod.
 *
 * Uso:
 *   CARD_RENDERER_SECRET=xxx node scripts/sign.js '<json-da-vaga>'
 *
 * Output:
 *   http://localhost:3000/api/card?data=<base64url>&token=<hex>
 *
 * Override do origin via CARD_RENDERER_URL (ex: https://cards.sonnarjobs.com.br).
 */

import { createHmac } from "node:crypto";

const secret = process.env.CARD_RENDERER_SECRET;
if (!secret) {
  console.error("Defina CARD_RENDERER_SECRET no ambiente.");
  process.exit(1);
}

const raw = process.argv[2];
if (!raw) {
  console.error("Uso: node scripts/sign.js '<json-da-vaga>'");
  process.exit(1);
}

// Valida que e JSON antes de assinar
try {
  JSON.parse(raw);
} catch (err) {
  console.error("Argumento nao e JSON valido:", err.message);
  process.exit(1);
}

const base64url = Buffer.from(raw, "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const token = createHmac("sha256", secret).update(base64url).digest("hex");

const origin = process.env.CARD_RENDERER_URL || "http://localhost:3000";
console.log(`${origin}/api/card?data=${base64url}&token=${token}`);
