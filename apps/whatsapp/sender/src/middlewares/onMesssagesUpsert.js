/**
 * Evento chamado quando uma mensagem
 * é enviada para o grupo do WhatsApp
 *
 * @author Dev Gui
 */
import { DEVELOPER_MODE, BOT_LID } from "../config.js";
import { badMacHandler } from "../utils/badMacHandler.js";
import { checkIfMemberIsMuted } from "../utils/database.js";
import { dynamicCommand } from "../utils/dynamicCommand.js";
import {
  GROUP_PARTICIPANT_ADD,
  GROUP_PARTICIPANT_LEAVE,
  isAddOrLeave,
  isAtLeastMinutesInPast,
} from "../utils/index.js";
import { loadCommonFunctions } from "../utils/loadCommonFunctions.js";
import { errorLog, infoLog, warningLog } from "../utils/logger.js";
import { customMiddleware } from "./customMiddleware.js";
import { messageHandler } from "./messageHandler.js";
import { onGroupParticipantsUpdate } from "./onGroupParticipantsUpdate.js";
import { handleIncomingMessage } from "../services/handover/incomingHandler.js";

// Dedup por id da mensagem — protege contra processamento duplicado
// (ex.: um socket antigo ainda emitindo durante uma reconexao).
const processedMessageIds = new Map();
const MESSAGE_DEDUP_TTL = 60 * 1000;

function alreadyProcessed(id) {
  if (!id) return false;
  const now = Date.now();
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.set(id, now);
  if (processedMessageIds.size > 500) {
    for (const [key, ts] of processedMessageIds) {
      if (now - ts > MESSAGE_DEDUP_TTL) processedMessageIds.delete(key);
    }
  }
  return false;
}

export async function onMessagesUpsert({ socket, messages, startProcess }) {
  if (!messages.length) {
    return;
  }

  for (const webMessage of messages) {
    // Ignora mensagens do próprio bot em qualquer contexto
    const userLid = webMessage.key?.participant;
    const botLidClean = BOT_LID.replace("@lid", "").replace("@s.whatsapp.net", "");
    const userLidClean = userLid?.replace(/:[0-9][0-9]|:[0-9]/g, "").replace("@lid", "").replace("@s.whatsapp.net", "") || "";
    
    if (userLidClean === botLidClean || webMessage.key?.fromMe) {
      continue;
    }

    // Ignora a mesma mensagem processada mais de uma vez.
    if (alreadyProcessed(webMessage.key?.id)) {
      continue;
    }

    if (DEVELOPER_MODE) {
      infoLog(
        `\n\n⪨========== [ MENSAGEM RECEBIDA ] ==========⪩ \n\n${JSON.stringify(
          messages,
          null,
          2
        )}`
      );
    }

    try {
      const timestamp = webMessage.messageTimestamp;

      // DEBUG: Log para identificar mensagens de mídia
      const hasImage = !!webMessage?.message?.imageMessage;
      const hasDocument = !!webMessage?.message?.documentMessage;
      const hasViewOnce = !!webMessage?.message?.viewOnceMessage || !!webMessage?.message?.viewOnceMessageV2;
      if (hasImage || hasDocument || hasViewOnce) {
        infoLog(`[DEBUG MEDIA] Mídia detectada - Image: ${hasImage}, Document: ${hasDocument}, ViewOnce: ${hasViewOnce}`);
        infoLog(`[DEBUG MEDIA] RemoteJid: ${webMessage?.key?.remoteJid}`);
        infoLog(`[DEBUG MEDIA] Message keys: ${Object.keys(webMessage?.message || {}).join(', ')}`);
      }

      if (webMessage?.message) {
        await messageHandler(socket, webMessage);
      }

      // v3.10.23: handover humano (menus Elkys+Sonnar + tickets + admin /r).
      // Roda ANTES do dynamicCommand: se a mensagem foi atendida pelo handover
      // (menu, modo humano, comando admin), pulamos o fluxo legado para nao
      // executar comandos antigos por engano. Em qualquer falha interna,
      // handleIncomingMessage devolve { handled: false } e cai no fluxo legado.
      try {
        const handoverResult = await handleIncomingMessage({ webMessage, socket });
        if (handoverResult.handled) {
          continue;
        }
      } catch (err) {
        errorLog(`[handover] falha nao capturada: ${err.message}`);
        // segue pro fluxo legado
      }

      if (isAtLeastMinutesInPast(timestamp)) {
        continue;
      }

      if (isAddOrLeave.includes(webMessage.messageStubType)) {
        let action = "";
        if (webMessage.messageStubType === GROUP_PARTICIPANT_ADD) {
          action = "add";
        } else if (webMessage.messageStubType === GROUP_PARTICIPANT_LEAVE) {
          action = "remove";
        }

        await customMiddleware({
          socket,
          webMessage,
          type: "participant",
          action,
          data: webMessage.messageStubParameters[0],
          commonFunctions: null,
        });

        await onGroupParticipantsUpdate({
          data: webMessage.messageStubParameters[0],
          remoteJid: webMessage.key.remoteJid,
          socket,
          action,
        });

        return;
      }
      if (
        await checkIfMemberIsMuted(
          webMessage?.key?.remoteJid,
          webMessage?.key?.participant?.replace(/:[0-9][0-9]|:[0-9]/g, "")
        )
      ) {
        try {
          const { id, remoteJid, participant } = webMessage.key;

          const deleteKey = {
            remoteJid,
            fromMe: false,
            id,
            participant,
          };

          await socket.sendMessage(remoteJid, { delete: deleteKey });
        } catch (error) {
          errorLog(
            `Erro ao deletar mensagem de membro silenciado, provavelmente eu não sou administrador do grupo! ${error.message}`
          );
        }

        return;
      }

      const commonFunctions = loadCommonFunctions({ socket, webMessage });

      if (!commonFunctions) {
        continue;
      }

      await customMiddleware({
        socket,
        webMessage,
        type: "message",
        commonFunctions,
      });

      await dynamicCommand(commonFunctions, startProcess);
    } catch (error) {
      if (badMacHandler.handleError(error, "message-processing")) {
        if (badMacHandler.hasReachedLimit()) {
          warningLog(
            "Limite de Bad MAC errors atingido durante processamento de mensagens. Limpando arquivos de sessÇœo..."
          );
          badMacHandler.clearProblematicSessionFiles();
          badMacHandler.resetErrorCount();
        }
        continue;
      }

      if (badMacHandler.isSessionError(error)) {
        errorLog(`Erro de sessão ao processar mensagem: ${error.message}`);
        continue;
      }

      errorLog(
        `Erro ao processar mensagem: ${error.message} | Stack: ${error.stack}`
      );

      continue;
    }
  }
}
