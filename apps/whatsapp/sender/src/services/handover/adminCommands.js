/**
 * adminCommands - parser e handlers dos comandos admin.
 *
 * Comandos suportados (so funcionam dos numeros em ADMIN_PHONES):
 *
 *   /r <fone> <mensagem>       Responde o cliente
 *   /responder <fone> <msg>    Alias longo de /r
 *   /encerrar <fone>           Encerra atendimento + pede rating
 *   /iniciar <fone>            Forca modo humano (sem cliente pedir)
 *   /status <fone>             Mostra estado atual da conversa
 *   /abertos                   Lista todos atendimentos abertos
 *   /notas <fone> <texto>      Adiciona nota interna no ticket
 *   /ajuda                     Lista comandos disponiveis
 */
import { ADMIN_PHONES, ADMIN_LIDS, NOTIFY_PHONES, NOTIFY_LIDS } from "../../config.js"
import { errorLog, successLog } from "../../utils/logger.js"
import { jidToPhone, phoneToJid, isAdminJid as _isAdminJid, resolveTargetJid } from "./lookupContact.js"
import {
  adminReplyToClient,
  closeHumanHandover,
  startHumanHandover,
} from "./humanHandover.js"
import {
  getConversation,
  listOpenConversations,
  upsertConversation,
} from "./conversationState.js"
import { appendInternalNote } from "./ticketManager.js"
import { lookupContact } from "./lookupContact.js"
import { handleConsultoriaCommand } from "./consultoriaAdmin.js"

const HELP_TEXT =
  `📚 *Comandos admin*\n\n` +
  `\`/r <fone> <msg>\`\n` +
  `Responde o cliente. Ex: \`/r 5511999999999 olá!\`\n\n` +
  `\`/encerrar <fone>\`\n` +
  `Encerra atendimento e pede avaliação 1-5.\n\n` +
  `\`/iniciar <fone>\`\n` +
  `Inicia atendimento sem cliente pedir.\n\n` +
  `\`/status <fone>\`\n` +
  `Mostra estado atual da conversa.\n\n` +
  `\`/abertos\`\n` +
  `Lista todos os atendimentos em aberto.\n\n` +
  `\`/notas <fone> <texto>\`\n` +
  `Adiciona nota interna no ticket (só admins veem).\n\n` +
  `\`/meulid\`\n` +
  `Mostra seu LID atual (pra configurar ADMIN_LIDS).\n\n` +
  `\`/consultoria abertos\`\n` +
  `Lista pedidos de consultoria pendentes/agendados.\n\n` +
  `\`/consultoria <id> ver|agendar|concluir|cancelar\`\n` +
  `Gerencia um pedido. Agendar usa formato DD/MM HH:MM.\n\n` +
  `\`/ajuda\`\n` +
  `Mostra esta lista.`

/**
 * Verifica se um JID corresponde a admin (phone OU LID).
 * v3.10.26: agora aceita LID além de phone.
 */
export function isAdminJid(jid) {
  return _isAdminJid(jid)
}

/**
 * Tenta interpretar uma mensagem como comando admin.
 * Retorna `{ handled: true }` quando processou (mesmo que tenha
 * respondido com erro). Retorna `{ handled: false }` se nao for comando.
 *
 * @returns {Promise<{ handled: boolean }>}
 */
export async function tryHandleAdminCommand({ jid, text, socket }) {
  const raw = (text || "").trim()
  if (!raw.startsWith("/")) return { handled: false }

  const [head, ...rest] = raw.split(/\s+/)
  const cmd = head.toLowerCase()
  const args = rest

  // v3.10.26: /meulid funciona pra QUALQUER usuario (precisa pra
  // descobrir o LID antes mesmo de virar admin). Demais comandos
  // exigem admin.
  if (cmd === "/meulid" || cmd === "/mylid") {
    await handleMyLid({ jid, socket })
    return { handled: true }
  }

  if (!isAdminJid(jid)) return { handled: false }

  const authorPhone = jidToPhone(jid)

  try {
    switch (cmd) {
      case "/ajuda":
      case "/help":
        await socket.sendMessage(jid, { text: HELP_TEXT })
        return { handled: true }

      case "/r":
      case "/responder":
        await handleReply({ jid, args, authorPhone, socket })
        return { handled: true }

      case "/encerrar":
      case "/close":
        await handleClose({ jid, args, authorPhone, socket })
        return { handled: true }

      case "/iniciar":
      case "/open":
        await handleStart({ jid, args, authorPhone, socket })
        return { handled: true }

      case "/status":
        await handleStatus({ jid, args, socket })
        return { handled: true }

      case "/abertos":
      case "/list":
        await handleList({ jid, socket })
        return { handled: true }

      case "/notas":
      case "/note":
        await handleNote({ jid, args, authorPhone, socket })
        return { handled: true }

      case "/meulid":
      case "/mylid":
        await handleMyLid({ jid, socket })
        return { handled: true }

      case "/consultoria":
        await handleConsultoriaCommand({ args, socket, jid })
        return { handled: true }

      default:
        // Comando desconhecido - mostra ajuda
        await socket.sendMessage(jid, {
          text: `❓ Comando *${cmd}* não reconhecido.\n\n${HELP_TEXT}`,
        })
        return { handled: true }
    }
  } catch (err) {
    errorLog(`[adminCommands] ${cmd} falhou: ${err.message}`)
    await socket.sendMessage(jid, {
      text: `❌ Erro ao processar ${cmd}: ${err.message}`,
    })
    return { handled: true }
  }
}

// ─── Handlers ───────────────────────────────────────────────────────

async function handleReply({ jid, args, authorPhone, socket }) {
  if (args.length < 2) {
    await socket.sendMessage(jid, {
      text: `⚠️ Uso: \`/r <fone> <mensagem>\`\nEx: \`/r 5511999999999 olá!\``,
    })
    return
  }
  const targetInput = args[0]
  const text = args.slice(1).join(" ")
  // v3.10.29: usa resolveTargetJid (async, busca no banco) ao inves de
  // phoneToJid cego. Necessario porque WhatsApp usa @lid e o admin nao
  // sabe se o cliente esta em @lid ou @s.whatsapp.net.
  const targetJid = await resolveTargetJid(targetInput)
  if (!targetJid) {
    await socket.sendMessage(jid, {
      text: `❌ Cliente *${targetInput}* não encontrado.\n\n` +
        `Verifique se o cliente já mandou alguma mensagem pro bot.`,
    })
    return
  }
  const targetPhone = jidToPhone(targetJid)

  const conv = await getConversation(targetJid)
  if (!conv || conv.mode !== "human") {
    await socket.sendMessage(jid, {
      text:
        `⚠️ Cliente *${targetInput}* não está em atendimento humano.\n\n` +
        `Use \`/iniciar ${targetInput}\` pra começar um.`,
    })
    return
  }

  const ok = await adminReplyToClient({
    targetJid,
    text,
    authorPhone,
    socket,
  })
  if (ok) {
    await socket.sendMessage(jid, {
      text: `✅ Enviado pra ${conv.display_name || `+${targetPhone}`}`,
    })
  } else {
    await socket.sendMessage(jid, {
      text: `❌ Falhou ao enviar pra ${conv.display_name || `+${targetPhone}`}. Veja logs do bot.`,
    })
  }
}

async function handleClose({ jid, args, authorPhone, socket }) {
  if (args.length < 1) {
    await socket.sendMessage(jid, {
      text: `⚠️ Uso: \`/encerrar <fone>\``,
    })
    return
  }
  const targetInput = args[0]
  const targetJid = await resolveTargetJid(targetInput)
  if (!targetJid) {
    await socket.sendMessage(jid, {
      text: `❌ Cliente *${targetInput}* não encontrado.`,
    })
    return
  }
  const conv = await getConversation(targetJid)
  if (!conv || conv.mode !== "human") {
    await socket.sendMessage(jid, {
      text: `⚠️ Cliente *${targetInput}* não está em atendimento humano.`,
    })
    return
  }
  await closeHumanHandover({ targetJid, closedByPhone: authorPhone, socket })
}

async function handleStart({ jid, args, authorPhone, socket }) {
  if (args.length < 1) {
    await socket.sendMessage(jid, {
      text: `⚠️ Uso: \`/iniciar <fone>\``,
    })
    return
  }
  const targetInput = args[0]
  const targetJid = await resolveTargetJid(targetInput)
  if (!targetJid) {
    await socket.sendMessage(jid, {
      text: `❌ Cliente *${targetInput}* não encontrado.\n\n` +
        `Cliente precisa ter mandado pelo menos uma mensagem pro bot antes.`,
    })
    return
  }
  const targetPhone = jidToPhone(targetJid)
  const contact = await lookupContact(targetJid)
  await startHumanHandover({
    jid: targetJid,
    contact,
    transition: {
      type: "human",
      category: "duvida",
      priority: "media",
      subject: "Atendimento iniciado pelo admin",
      notify: "👤 *Atendimento iniciado por admin*",
    },
    lastMessage: `Atendimento iniciado por +${authorPhone}`,
    socket,
  })

  // v3.10.29: avisa o CLIENTE que um atendente vai responder.
  // Antes o /iniciar so notificava admins - cliente ficava sem feedback.
  try {
    await socket.sendMessage(targetJid, {
      text:
        `💬 *Atendimento iniciado*\n\n` +
        `Um atendente humano vai te responder por aqui em instantes. ` +
        `Pode mandar suas dúvidas que vamos te ajudar.`,
    })
  } catch (err) {
    errorLog(`[handleStart] aviso ao cliente falhou: ${err.message}`)
  }

  await socket.sendMessage(jid, {
    text:
      `✅ Atendimento iniciado pra ${contact.displayName} (+${targetPhone})\n\n` +
      `Use \`/r ${targetPhone} <mensagem>\` pra falar.`,
  })
}

async function handleStatus({ jid, args, socket }) {
  if (args.length < 1) {
    await socket.sendMessage(jid, { text: `⚠️ Uso: \`/status <fone>\`` })
    return
  }
  const targetInput = args[0]
  const targetJid = await resolveTargetJid(targetInput)
  if (!targetJid) {
    await socket.sendMessage(jid, { text: `❌ Cliente *${targetInput}* não encontrado.` })
    return
  }
  const targetPhone = jidToPhone(targetJid)
  const conv = await getConversation(targetJid)
  if (!conv) {
    await socket.sendMessage(jid, {
      text: `📭 Nenhuma conversa encontrada pra +${targetPhone}.`,
    })
    return
  }
  const lastMsg = conv.last_message_text
    ? `\n_Última msg: "${conv.last_message_text.slice(0, 80)}"_`
    : ""
  const summary =
    `📋 *Status - +${targetPhone}*\n\n` +
    `*Modo:* ${conv.mode}\n` +
    `*Menu:* ${conv.current_menu}\n` +
    `*Tipo:* ${conv.identified_as}\n` +
    `*Nome:* ${conv.display_name || "-"}\n` +
    `*Ticket:* ${conv.active_ticket_id ? conv.active_ticket_id.slice(0, 8) : "-"}\n` +
    `*Plano Sonnar:* ${conv.subscriber_plan || "-"}` +
    lastMsg
  await socket.sendMessage(jid, { text: summary })
}

async function handleList({ jid, socket }) {
  const open = await listOpenConversations()
  if (!open.length) {
    await socket.sendMessage(jid, {
      text: `📭 Nenhum atendimento em aberto agora.`,
    })
    return
  }
  const lines = open.slice(0, 20).map((c) => {
    const phone = jidToPhone(c.jid)
    const name = c.display_name || `+${phone}`
    const lastMin = c.last_message_at
      ? Math.round((Date.now() - new Date(c.last_message_at).getTime()) / 60000)
      : "?"
    return `• ${name}  _(+${phone}, ${lastMin}min)_`
  })
  await socket.sendMessage(jid, {
    text: `📬 *Atendimentos abertos (${open.length})*\n\n${lines.join("\n")}`,
  })
}

async function handleMyLid({ jid, socket }) {
  const phone = jidToPhone(jid)
  const isAdmin = ADMIN_LIDS.includes(jid) || ADMIN_PHONES.includes(phone)
  const isNotify = NOTIFY_LIDS.includes(jid) || NOTIFY_PHONES.includes(phone)

  let status
  if (isAdmin) {
    status = "✅ *ADMIN* - voce pode usar /r, /encerrar, etc"
  } else if (isNotify) {
    status = "🔔 *NOTIFY* - voce recebe notificacoes mas nao pode dar comandos"
  } else {
    status = "⚠️ Voce nao esta cadastrado como admin nem notify"
  }

  const msg =
    `🆔 *Seu LID atual:*\n\n` +
    `\`${jid}\`\n\n` +
    `*Dígitos:* ${phone || "(sem dígitos)"}\n\n` +
    status + `\n\n` +
    `*Pra cadastrar este LID:*\n\n` +
    `Como ADMIN (poder de comando):\n` +
    `\`ADMIN_LIDS=${jid}\`\n\n` +
    `Como NOTIFY (so recebe notificacao):\n` +
    `\`NOTIFY_LIDS=${jid}\`\n\n` +
    `Edite \`apps/whatsapp/sender/.env\` e rode\n` +
    `\`pm2 restart sonnar-wa-sender --update-env\``
  await socket.sendMessage(jid, { text: msg })
}

async function handleNote({ jid, args, authorPhone, socket }) {
  if (args.length < 2) {
    await socket.sendMessage(jid, {
      text: `⚠️ Uso: \`/notas <fone> <texto>\``,
    })
    return
  }
  const targetInput = args[0]
  const note = args.slice(1).join(" ")
  const targetJid = await resolveTargetJid(targetInput)
  if (!targetJid) {
    await socket.sendMessage(jid, { text: `❌ Cliente *${targetInput}* não encontrado.` })
    return
  }
  const conv = await getConversation(targetJid)
  if (!conv?.active_ticket_id) {
    await socket.sendMessage(jid, {
      text: `⚠️ Cliente *${targetInput}* não tem ticket aberto.`,
    })
    return
  }
  const ok = await appendInternalNote(conv.active_ticket_id, note, authorPhone)
  if (ok) {
    await socket.sendMessage(jid, { text: `✅ Nota salva no ticket.` })
  }
}
