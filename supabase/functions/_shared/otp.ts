// Helpers compartilhados para o fluxo de OTP de confirmação de email.
// Cobre geração de código de 8 dígitos, hashing (SHA-256 com pepper) e
// envio do email via Resend usando o template Sonnar.

import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderSonnarEmail } from "./emailTemplate.ts";

export const OTP_CODE_LENGTH = 8;
export const OTP_TTL_MINUTES = 15;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

const FROM = "Sonnar <noreply@sonnarjobs.com.br>";

// Gera 8 dígitos uniformemente distribuídos. Usa crypto.getRandomValues
// rejeitando valores acima do múltiplo de 10 mais próximo para evitar bias.
export function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH;        // 100_000_000
  const cap = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= cap);
  return (n % max).toString().padStart(OTP_CODE_LENGTH, "0");
}

export async function hashOtp(code: string): Promise<string> {
  const pepper = Deno.env.get("OTP_PEPPER") ?? "";
  if (!pepper) {
    // Mensagem clara nos logs - sem pepper, rainbow table de 10^8 hashes
    // é trivial. Em produção isso DEVE estar setado.
    console.warn("[otp] OTP_PEPPER not configured - hashes are predictable");
  }
  const data = new TextEncoder().encode(pepper + code);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparação constant-time para evitar timing attacks na verificação.
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface SendOtpEmailParams {
  to: string;
  code: string;
  name?: string | null;
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const greeting = params.name ? `Olá, ${params.name}.` : "Olá.";
  const html = renderSonnarEmail({
    preheader: "Confirme seu cadastro com o código abaixo",
    greeting,
    intro:
      "Recebemos seu cadastro no Sonnar. Para ativar sua conta, informe o código de verificação abaixo na página de confirmação.",
    otpCode: { label: "Seu código de verificação", value: params.code },
    postCta:
      `Este código é de uso único e expira em ${OTP_TTL_MINUTES} minutos. Caso não tenha solicitado o cadastro, ignore este e-mail.`,
    signOff: "Atenciosamente,",
    signature: "Equipe Sonnar",
    footnotes: [
      "Caso o(a) senhor(a) não reconheça esta solicitação, ignore este e-mail. Nenhuma ação será tomada sem confirmação.",
      "Permanecemos à disposição. Este e-mail aceita resposta direta.",
    ],
  });

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: "Seu código de confirmação - Sonnar",
    html,
  });
  if (error) {
    throw new Error(error.message ?? "resend send failed");
  }
}
