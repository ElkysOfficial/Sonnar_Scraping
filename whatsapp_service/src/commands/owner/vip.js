import { PREFIX } from "../../config.js";
import {
  addVipSubscriber,
  removeVipSubscriber,
  getVipSubscribers,
  getVipSubscriber,
} from "../../utils/database.js";

export default {
  name: "vip",
  description: "Gerencia assinantes VIP (vagas personalizadas)",
  commands: ["vip", "assinante", "subscriber"],
  usage: `${PREFIX}vip <add|remove|list> [lid] [stacks]`,
  /**
   * @param {CommandHandleProps} props
   */
  handle: async ({
    args,
    fullArgs,
    sendReply,
    sendSuccessReply,
    sendErrorReply,
    sendWarningReply,
  }) => {
    const action = args[0]?.toLowerCase();

    if (!action) {
      const help = `*📋 Comandos VIP*

*Adicionar assinante:*
${PREFIX}vip add <lid> <stacks>

*Exemplos:*
${PREFIX}vip add 120152280592452@lid estágio
${PREFIX}vip add 120152280592452@lid frontend,backend
${PREFIX}vip add 120152280592452@lid todas

*Remover assinante:*
${PREFIX}vip remove <lid>

*Listar assinantes:*
${PREFIX}vip list

*Ver assinante específico:*
${PREFIX}vip info <lid>

*Stacks disponíveis:*
estágio, frontend, backend, fullstack, mobile, devops, data, qa, todas`;

      return await sendReply(help);
    }

    switch (action) {
      case "add":
      case "adicionar": {
        const lid = args[1];
        const stacksArg = args.slice(2).join(" ");

        if (!lid) {
          return await sendErrorReply(
            `Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip add 120152280592452@lid estágio`
          );
        }

        if (!stacksArg) {
          return await sendErrorReply(
            `Informe as stacks do assinante.\n\nExemplo: ${PREFIX}vip add ${lid} frontend,backend`
          );
        }

        // Normaliza o LID
        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;

        // Processa as stacks (separadas por vírgula ou espaço)
        const stacks = stacksArg
          .split(/[,\s]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0);

        const isNew = addVipSubscriber(normalizedLid, stacks);

        if (isNew) {
          return await sendSuccessReply(
            `Assinante VIP adicionado!\n\n👤 *LID:* ${normalizedLid}\n📚 *Stacks:* ${stacks.join(", ")}`
          );
        } else {
          return await sendSuccessReply(
            `Assinante VIP atualizado!\n\n👤 *LID:* ${normalizedLid}\n📚 *Stacks:* ${stacks.join(", ")}`
          );
        }
      }

      case "remove":
      case "remover":
      case "delete":
      case "deletar": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(
            `Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip remove 120152280592452@lid`
          );
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const removed = removeVipSubscriber(normalizedLid);

        if (removed) {
          return await sendSuccessReply(
            `Assinante VIP removido!\n\n👤 *LID:* ${normalizedLid}`
          );
        } else {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }
      }

      case "list":
      case "listar":
      case "ls": {
        const subscribers = getVipSubscribers();

        if (subscribers.length === 0) {
          return await sendReply("📋 Nenhum assinante VIP cadastrado.");
        }

        let message = `*📋 Assinantes VIP (${subscribers.length})*\n\n`;

        subscribers.forEach((sub, index) => {
          message += `*${index + 1}.* ${sub.lid}\n`;
          message += `   📚 Stacks: ${sub.stacks.join(", ")}\n`;
          message += `   📅 Desde: ${new Date(sub.addedAt).toLocaleDateString("pt-BR")}\n\n`;
        });

        return await sendReply(message);
      }

      case "info":
      case "ver": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(
            `Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip info 120152280592452@lid`
          );
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const subscriber = getVipSubscriber(normalizedLid);

        if (!subscriber) {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }

        const message = `*👤 Assinante VIP*

*LID:* ${subscriber.lid}
*Stacks:* ${subscriber.stacks.join(", ")}
*Adicionado em:* ${new Date(subscriber.addedAt).toLocaleString("pt-BR")}
${subscriber.updatedAt ? `*Atualizado em:* ${new Date(subscriber.updatedAt).toLocaleString("pt-BR")}` : ""}`;

        return await sendReply(message);
      }

      default:
        return await sendErrorReply(
          `Ação inválida: ${action}\n\nUse: add, remove, list ou info`
        );
    }
  },
};
