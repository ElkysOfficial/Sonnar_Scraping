import { PREFIX } from "../../config.js";
import {
  addVipSubscriber,
  removeVipSubscriber,
  getVipSubscribers,
  getVipSubscriber,
  getVipPendingSubscribers,
  approveVipSubscriber,
  rejectVipSubscriber,
} from "../../utils/database.js";
import { triggerVipSearch } from "../../services/vipJobSender.js";

export default {
  name: "vip",
  description: "Gerencia assinantes VIP (vagas personalizadas)",
  commands: ["vip", "assinante", "subscriber"],
  usage: `${PREFIX}vip <add|remove|list|pending|approve|reject|search> [args]`,
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
    let action = args[0]?.toLowerCase();
    const isLidArg = (value) => !!value && (/^\d+@lid$/i.test(value) || /^\d+$/i.test(value));

    // Função para formatar filtros
    const formatFilters = (filters) => {
      if (!filters) return "Nenhum filtro definido.";
      const lines = [];
      if (filters.roles?.length) lines.push(`Cargos: ${filters.roles.join(", ")}`);
      if (filters.stacks?.length) lines.push(`Stacks: ${filters.stacks.join(", ")}`);
      if (filters.seniority?.length) lines.push(`Senioridade: ${filters.seniority.join(", ")}`);
      if (filters.locations?.length) lines.push(`Local: ${filters.locations.join(", ")}`);
      if (filters.workMode?.length) lines.push(`Modalidade: ${filters.workMode.join(", ")}`);
      if (filters.contract?.length) lines.push(`Contrato: ${filters.contract.join(", ")}`);
      if (filters.languages?.length) lines.push(`Idiomas: ${filters.languages.join(", ")}`);
      return lines.length ? lines.join("\n") : "Nenhum filtro definido.";
    };

    // Função para parsear filtros de texto
    const parseFiltersFromText = (text) => {
      const filters = {
        roles: [],
        stacks: [],
        seniority: [],
        locations: [],
        workMode: [],
        contract: [],
        languages: []
      };

      const items = text.toLowerCase().split(/[,\s]+/).filter(Boolean);

      const seniorityTerms = ["trainee", "junior", "jr", "pleno", "senior", "sr", "estagio", "estágio"];
      const workModeTerms = ["remoto", "hibrido", "híbrido", "presencial"];
      const contractTerms = ["clt", "pj", "freelance", "estagio", "estágio"];
      const roleTerms = ["desenvolvedor", "dev", "programador", "analista", "engenheiro", "cientista"];

      for (const item of items) {
        if (seniorityTerms.includes(item)) {
          filters.seniority.push(item);
        } else if (workModeTerms.includes(item)) {
          filters.workMode.push(item);
        } else if (contractTerms.includes(item)) {
          filters.contract.push(item);
        } else if (roleTerms.includes(item)) {
          filters.roles.push(item);
        } else {
          filters.stacks.push(item);
        }
      }

      return filters;
    };

    // Atalho: /vip <lid> <filtros> => trata como "add"
    if (action && isLidArg(action) && !["add", "adicionar", "remove", "remover", "delete", "deletar", "list", "listar", "ls", "info", "ver", "search", "buscar", "pending", "pendentes", "approve", "aprovar", "reject", "rejeitar"].includes(action)) {
      args.unshift("add");
      action = "add";
    }

    if (!action) {
      const help = `*Comandos VIP*

*Adicionar assinante:*
${PREFIX}vip add "Nome" <lid> <filtros>

*Exemplos:*
${PREFIX}vip add "João Silva" 120152280592452@lid python,junior,remoto
${PREFIX}vip add "Maria" 120152280592452@lid frontend,backend,pleno

*Ver pendentes de aprovação:*
${PREFIX}vip pending

*Aprovar VIP pendente:*
${PREFIX}vip approve <lid>

*Rejeitar VIP pendente:*
${PREFIX}vip reject <lid>

*Remover assinante:*
${PREFIX}vip remove <lid>

*Listar assinantes:*
${PREFIX}vip list

*Ver assinante específico:*
${PREFIX}vip info <lid>

*Buscar vagas para assinante:*
${PREFIX}vip search <lid>`;

      return await sendReply(help);
    }

    switch (action) {
      case "add":
      case "adicionar": {
        // Extrai nome entre aspas se existir
        let name = "";
        let restArgs = args.slice(1);
        const fullArgsStr = fullArgs || args.slice(1).join(" ");
        const nameMatch = fullArgsStr.match(/^["']([^"']+)["']\s*/);

        if (nameMatch) {
          name = nameMatch[1];
          restArgs = fullArgsStr.slice(nameMatch[0].length).trim().split(/\s+/);
        } else {
          name = `VIP_${args[1]?.replace("@lid", "") || "unknown"}`;
          restArgs = args.slice(1);
        }

        const lid = restArgs[0];
        const filtersArg = restArgs.slice(1).join(" ").trim();

        if (!lid) {
          return await sendErrorReply(`Informe o nome e LID do assinante.\n\nExemplo: ${PREFIX}vip add "João Silva" 120152280592452@lid python,junior`);
        }

        if (!filtersArg) {
          return await sendErrorReply(`Informe os filtros do assinante.\n\nExemplo: ${PREFIX}vip add "${name}" ${lid} python,junior,remoto`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const filters = parseFiltersFromText(filtersArg);

        if (!filters.stacks.length && !filters.roles.length) {
          return await sendErrorReply("Nenhum filtro válido encontrado. Informe ao menos uma stack ou cargo.");
        }

        const isNew = await addVipSubscriber(name, normalizedLid, filters);
        const formattedFilters = formatFilters(filters);

        if (isNew) {
          await sendSuccessReply(`Assinante VIP adicionado!\n\nNome: ${name}\nLID: ${normalizedLid}\n\n${formattedFilters}\n\nIniciando busca de vagas...`);
        } else {
          await sendSuccessReply(`Assinante VIP atualizado!\n\nNome: ${name}\nLID: ${normalizedLid}\n\n${formattedFilters}\n\nIniciando busca de vagas...`);
        }

        triggerVipSearch(normalizedLid, filters)
          .then((result) => {
            if (result.success) {
              if (result.queued) {
                console.log(`[VIP] Busca enfileirada para ${normalizedLid} (conexao fechada).`);
                return;
              }
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

      case "pending":
      case "pendentes": {
        const pending = (await getVipPendingSubscribers()).filter(p => p.status === "pending");

        if (pending.length === 0) {
          return await sendReply("Nenhum VIP pendente de aprovação.");
        }

        let message = `*VIPs Pendentes (${pending.length})*\n\n`;

        pending.forEach((p, index) => {
          message += `*${index + 1}.* ${p.name || "Sem nome"}\n`;
          message += `   LID: ${p.lid}\n`;
          message += `   Solicitado: ${new Date(p.requestedAt).toLocaleString("pt-BR")}\n`;
          if (p.paymentProof) {
            message += `   Comprovante: Recebido\n`;
          }
          message += `\n`;
        });

        message += `\nPara aprovar: ${PREFIX}vip approve <lid>\nPara rejeitar: ${PREFIX}vip reject <lid>`;

        return await sendReply(message);
      }

      case "approve":
      case "aprovar": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(`Informe o LID do VIP a aprovar.\n\nExemplo: ${PREFIX}vip approve 120152280592452@lid`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const result = await approveVipSubscriber(normalizedLid, "owner_command");

        if (result.ok) {
          return await sendSuccessReply(`VIP aprovado!\n\nNome: ${result.subscriber?.name || "N/A"}\nLID: ${normalizedLid}\n\nO cliente agora receberá vagas personalizadas.`);
        } else {
          return await sendWarningReply(`VIP não encontrado ou já processado: ${normalizedLid}`);
        }
      }

      case "reject":
      case "rejeitar": {
        const lid = args[1];
        const reason = args.slice(2).join(" ") || "Pagamento não confirmado";

        if (!lid) {
          return await sendErrorReply(`Informe o LID do VIP a rejeitar.\n\nExemplo: ${PREFIX}vip reject 120152280592452@lid`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const result = await rejectVipSubscriber(normalizedLid, "owner_command", reason);

        if (result.ok) {
          return await sendSuccessReply(`VIP rejeitado!\n\nLID: ${normalizedLid}\nMotivo: ${reason}`);
        } else {
          return await sendWarningReply(`VIP não encontrado ou já processado: ${normalizedLid}`);
        }
      }

      case "search":
      case "buscar": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(`Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip search 120152280592452@lid`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const subscriber = await getVipSubscriber(normalizedLid);

        if (!subscriber) {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }

        const filters = subscriber.filters || { stacks: subscriber.stacks || [] };
        await sendWaitReply(`Buscando vagas para ${normalizedLid}...\n${formatFilters(filters)}`);

        try {
          const result = await triggerVipSearch(normalizedLid, filters);

          if (result.queued) {
            return await sendWarningReply("Conexão fechada. Busca VIP enfileirada.");
          }

          if (result.success) {
            return await sendSuccessReply(`Busca concluída!\n\nVagas encontradas: ${result.jobsFound}\nVagas enviadas: ${result.jobsSent}`);
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
          return await sendErrorReply(`Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip remove 120152280592452@lid`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const removed = await removeVipSubscriber(normalizedLid);

        if (removed) {
          return await sendSuccessReply(`Assinante VIP removido!\n\nLID: ${normalizedLid}`);
        } else {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }
      }

      case "list":
      case "listar":
      case "ls": {
        const subscribers = await getVipSubscribers();

        if (subscribers.length === 0) {
          return await sendReply("Nenhum assinante VIP cadastrado.");
        }

        let message = `*Assinantes VIP (${subscribers.length})*\n\n`;

        subscribers.forEach((sub, index) => {
          message += `*${index + 1}.* ${sub.name || "Sem nome"}\n`;
          message += `   LID: ${sub.lid}\n`;
          const filters = sub.filters || { stacks: sub.stacks || [] };
          message += `   ${formatFilters(filters).split("\n").join("\n   ")}\n`;
          message += `   Desde: ${new Date(sub.addedAt).toLocaleDateString("pt-BR")}\n\n`;
        });

        return await sendReply(message);
      }

      case "info":
      case "ver": {
        const lid = args[1];

        if (!lid) {
          return await sendErrorReply(`Informe o LID do assinante.\n\nExemplo: ${PREFIX}vip info 120152280592452@lid`);
        }

        const normalizedLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const subscriber = await getVipSubscriber(normalizedLid);

        if (!subscriber) {
          return await sendWarningReply(`Assinante não encontrado: ${normalizedLid}`);
        }

        const filters = subscriber.filters || { stacks: subscriber.stacks || [] };
        const message = `*Assinante VIP*

Nome: ${subscriber.name || "Não informado"}
LID: ${subscriber.lid}

${formatFilters(filters)}

Adicionado em: ${new Date(subscriber.addedAt).toLocaleString("pt-BR")}
${subscriber.updatedAt ? `Atualizado em: ${new Date(subscriber.updatedAt).toLocaleString("pt-BR")}` : ""}`;

        return await sendReply(message);
      }

      default:
        return await sendErrorReply(`Ação inválida: ${action}\n\nUse: add, remove, list, pending, approve, reject, info ou search`);
    }
  },
};
