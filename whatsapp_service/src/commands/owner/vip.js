import { PREFIX } from "../../config.js";
import {
  addVipSubscriber,
  removeVipSubscriber,
  getVipSubscribers,
  getVipSubscriber,
} from "../../utils/database.js";
import { triggerVipSearch } from "../../services/vipJobSender.js";

export default {
  name: "vip",
  description: "Gerencia assinantes VIP (vagas personalizadas)",
  commands: ["vip", "assinante", "subscriber"],
  usage: `${PREFIX}vip <add|remove|list|search> [lid] [stacks]`,
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
    sendWaitReply,
    socket,
  }) => {
    const action = args[0]?.toLowerCase();

    if (!action) {
      const help = `*📋 Comandos VIP*

*Adicionar assinante (já dispara busca):*
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

*Buscar vagas agora para um assinante:*
${PREFIX}vip search <lid>

*Stacks disponíveis:*
estágio, frontend, backend, fullstack, mobile, devops, data, qa, react, node, python, java, todas`;

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
          await sendSuccessReply(
            `Assinante VIP adicionado!\n\n👤 *LID:* ${normalizedLid}\n📚 *Stacks:* ${stacks.join(", ")}\n\n⏳ Iniciando busca de vagas...`
          );
        } else {
          await sendSuccessReply(
            `Assinante VIP atualizado!\n\n👤 *LID:* ${normalizedLid}\n📚 *Stacks:* ${stacks.join(", ")}\n\n⏳ Iniciando busca de vagas...`
          );
        }

        // Dispara busca imediata em background
        triggerVipSearch(socket, normalizedLid, stacks)
          .then((result) => {
            if (result.success) {
              console.log(`[VIP] Busca concluída para ${normalizedLid}: ${result.jobsSent} vagas enviadas`);
            } else {
              console.error(`[VIP] Erro na busca para ${normalizedLid}: ${result.error}`);
            }
          })
          .catch((err) => {
            console.error(`[VIP] Erro ao disparar busca: ${err.message}`);
          });

        return;
      }

      case "search":
      case "buscar": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(
            `Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip search 120152280592452@lid`
          );
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const subscriber = getVipSubscriber(normalizedLid);

        if (!subscriber) {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }

        await sendWaitReply(`Buscando vagas para ${normalizedLid}...\nStacks: ${subscriber.stacks.join(", ")}`);

        // Dispara busca
        try {
          const result = await triggerVipSearch(socket, normalizedLid, subscriber.stacks);

          if (result.success) {
            return await sendSuccessReply(
              `Busca concluída!\n\n📊 *Vagas encontradas:* ${result.jobsFound}\n📤 *Vagas enviadas:* ${result.jobsSent}`
            );
          } else {
            return await sendErrorReply(`Erro na busca: ${result.error}`);
          }
        } catch (err) {
          return await sendErrorReply(`Erro ao buscar: ${err.message}`);
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
          `Ação inválida: ${action}\n\nUse: add, remove, list, info ou search`
        );
    }
  },
};
