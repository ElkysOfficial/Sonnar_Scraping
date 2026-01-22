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
        messageHandler(socket, webMessage);
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
        checkIfMemberIsMuted(
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
