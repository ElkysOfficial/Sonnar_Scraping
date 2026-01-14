import { PREFIX } from "../../config.js";
import { WarningError } from "../../errors/index.js";

export default {
  name: "get-group-id",
  description: "Retorna o ID completo de um grupo no formato JID.",
  commands: ["get-group-id", "id-get", "id-group", "groupid"],
  usage: `${PREFIX}get-group-id`,
  /**
   * @param {CommandHandleProps} props
   */
  handle: async ({ remoteJid, sendSuccessReply, isGroup, socket }) => {
    if (!isGroup) {
      throw new WarningError("Este comando deve ser usado dentro de um grupo.");
    }

    try {
      const groupMetadata = await socket.groupMetadata(remoteJid);

      const response =
        `*📋 Informações do Grupo*\n\n` +
        `📝 *Nome:* ${groupMetadata.subject}\n` +
        `🆔 *ID:* ${remoteJid}\n` +
        `👥 *Membros:* ${groupMetadata.participants.length}\n` +
        `👑 *Criador:* ${groupMetadata.owner || "Não disponível"}\n\n` +
        `_Para configurar o envio de vagas neste grupo, copie o ID acima e cole no arquivo config.js na variável JOB_GROUP_ID_`;

      await sendSuccessReply(response);
    } catch (error) {
      await sendSuccessReply(
        `*ID do grupo:* ${remoteJid}\n\n_Erro ao obter informações adicionais_`
      );
    }
  },
};
