/**
 * Vigia de cobrança do VIP (Fluxo B).
 *
 * Roda periodicamente e cuida do ciclo de vida da assinatura:
 *  - dá boas-vindas a quem teve o VIP de cartão ativado pelo webhook;
 *  - avisa o cliente (WhatsApp + e-mail) 7 dias antes de um VIP PIX expirar;
 *  - expira VIPs PIX vencidos e avisa o cliente e o owner;
 *  - avisa quem caiu em past_due (cartão recusado) para atualizar o cartão.
 *
 * A coluna billing_notifications (JSONB em vip_subscribers) registra os
 * avisos já enviados, evitando repetição. A renovação PIX zera esse registro.
 */
import axios from "axios"
import { supabase } from "./database.js"
import { OWNER_LID, WEB_FUNCTIONS_URL, WHATSAPP_LINK_SECRET, PORTAL_URL } from "../config.js"
import { infoLog, errorLog } from "../utils/logger.js"

const CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutos
const EXPIRY_WARNING_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const PIX_KEY = "64.095.868/0001-03"

let billingIntervalId = null
let billingSocket = null

async function sendWa(lid, text) {
  if (!billingSocket || !lid) return
  try {
    await billingSocket.sendMessage(lid, { text })
  } catch (e) {
    errorLog(`[VIP BILLING] Falha ao enviar WhatsApp a ${lid}: ${e.message}`)
  }
}

async function sendEmail(email, kind, name) {
  if (!email || !WEB_FUNCTIONS_URL || !WHATSAPP_LINK_SECRET) return
  try {
    await axios.post(
      `${WEB_FUNCTIONS_URL.replace(/\/$/, "")}/notify-vip-billing`,
      { email, name: name || "", kind },
      {
        headers: {
          "x-link-secret": WHATSAPP_LINK_SECRET,
          "Content-Type": "application/json"
        },
        timeout: 15000,
        validateStatus: () => true
      }
    )
  } catch (e) {
    errorLog(`[VIP BILLING] Falha ao enviar e-mail (${kind}) a ${email}: ${e.message}`)
  }
}

async function markNotified(lid, key, current) {
  const next = { ...(current || {}), [key]: new Date().toISOString() }
  const { error } = await supabase
    .from("vip_subscribers")
    .update({ billing_notifications: next })
    .eq("lid", lid)
  if (error) {
    errorLog(`[VIP BILLING] Falha ao marcar aviso ${key} de ${lid}: ${error.message}`)
  }
}

function welcomeText(name) {
  return `*Seu VIP foi ativado!* 🎉

${name ? `${name}, o` : "O"} seu pagamento por cartão foi confirmado e a assinatura está ativa.

🎯 A partir de agora você recebe vagas personalizadas do seu perfil aqui no WhatsApp.

📧 Enviamos também um e-mail com o acesso ao portal.`
}

function expiryWarningText(name, daysLeft) {
  return `*Seu VIP vai expirar* ⏳

${name ? `${name}, o` : "O"} seu acesso VIP por PIX vence em *${daysLeft} dia(s)*.

Para continuar recebendo as vagas, faça um novo PIX e envie o comprovante por aqui.
🔑 *CNPJ:* ${PIX_KEY}`
}

function expiredText(name) {
  return `*Seu VIP expirou* 😕

${name ? `${name}, o` : "O"} seu acesso VIP por PIX chegou ao fim e você parou de receber as vagas personalizadas.

Para reativar, faça um novo PIX e envie o comprovante por aqui.
🔑 *CNPJ:* ${PIX_KEY}`
}

function pastDueText(name) {
  return `*Pagamento recusado* ⚠️

${name ? `${name}, a` : "A"} cobrança recorrente do seu cartão não foi aprovada.

Atualize os dados do cartão no portal para não perder o acesso VIP:
${PORTAL_URL}/login`
}

async function runBillingTick() {
  try {
    const nowMs = Date.now()

    // Ativos ou em atraso: boas-vindas, aviso de expiração e past_due.
    const { data: rows, error } = await supabase
      .from("vip_subscribers")
      .select("lid, user_name, email, payment_method, status, expires_at, billing_notifications")
      .in("status", ["active", "past_due"])
    if (error) {
      errorLog(`[VIP BILLING] Falha ao ler vip_subscribers: ${error.message}`)
      return
    }

    for (const v of rows || []) {
      const flags = v.billing_notifications || {}

      // Boas-vindas: VIP de cartão ativado pelo webhook.
      if (v.status === "active" && v.payment_method === "card" && !flags.welcome) {
        await sendWa(v.lid, welcomeText(v.user_name))
        await markNotified(v.lid, "welcome", flags)
        continue
      }

      // Cartão recusado (past_due): pede atualização do cartão.
      if (v.status === "past_due" && v.payment_method === "card" && !flags.past_due) {
        await sendWa(v.lid, pastDueText(v.user_name))
        await sendEmail(v.email, "past_due", v.user_name)
        await markNotified(v.lid, "past_due", flags)
        continue
      }

      // Aviso de expiração do PIX (7 dias antes).
      if (
        v.status === "active" &&
        v.payment_method === "pix" &&
        v.expires_at &&
        !flags.expiry_warning
      ) {
        const daysLeft = Math.ceil((new Date(v.expires_at).getTime() - nowMs) / DAY_MS)
        if (daysLeft > 0 && daysLeft <= EXPIRY_WARNING_DAYS) {
          await sendWa(v.lid, expiryWarningText(v.user_name, daysLeft))
          await sendEmail(v.email, "expiry_warning", v.user_name)
          await markNotified(v.lid, "expiry_warning", flags)
        }
      }
    }

    // VIPs PIX vencidos: marca expired e avisa cliente + owner.
    const { data: expired, error: expErr } = await supabase
      .from("vip_subscribers")
      .select("lid, user_name, email, billing_notifications")
      .eq("status", "active")
      .eq("payment_method", "pix")
      .lt("expires_at", new Date().toISOString())
    if (expErr) {
      errorLog(`[VIP BILLING] Falha ao buscar VIPs vencidos: ${expErr.message}`)
      return
    }

    for (const v of expired || []) {
      const { error: updErr } = await supabase
        .from("vip_subscribers")
        .update({ status: "expired" })
        .eq("lid", v.lid)
      if (updErr) {
        errorLog(`[VIP BILLING] Falha ao expirar ${v.lid}: ${updErr.message}`)
        continue
      }
      await sendWa(v.lid, expiredText(v.user_name))
      await sendEmail(v.email, "expired", v.user_name)
      await sendWa(
        OWNER_LID,
        `🔔 *VIP PIX expirado*\n\nCliente: ${v.user_name || "—"}\nLID: ${v.lid}\n\nAo receber um novo PIX, aprove novamente para renovar +30 dias.`
      )
      await markNotified(v.lid, "expired", v.billing_notifications)
      infoLog(`[VIP BILLING] VIP PIX expirado: ${v.user_name} (${v.lid})`)
    }
  } catch (e) {
    errorLog(`[VIP BILLING] Erro no ciclo: ${e.message}`)
  }
}

/**
 * Inicia o vigia de cobrança do VIP. Idempotente.
 * @param {import("baileys").WASocket} socket
 */
export function startVipBillingWatcher(socket) {
  billingSocket = socket
  if (billingIntervalId) return
  infoLog(`[VIP BILLING] Vigia de cobrança iniciado (intervalo de ${CHECK_INTERVAL_MS / 60000} min)`)
  // Primeira passada após 30s, garantindo conexão estável.
  setTimeout(runBillingTick, 30 * 1000)
  billingIntervalId = setInterval(runBillingTick, CHECK_INTERVAL_MS)
}

export default { startVipBillingWatcher }
