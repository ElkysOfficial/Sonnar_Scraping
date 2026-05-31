/**
 * menuRouter - fluxos conversacionais Elkys + Sonnar (v3.10.30)
 *
 * Padrao "Apple": textos limpos, hierarquia clara, sem decoracao emoji
 * excessiva. Numeracao no menu mas reconhece texto livre via
 * intentDetector.
 *
 * Estados do menuRouter:
 *   - root                 menu Elkys raiz (6 opcoes)
 *   - coleta_orcamento     coletando descricao do projeto
 *   - coleta_reuniao       coletando dados pra reuniao
 *   - menu_pagamento       escolha PIX vs Boleto
 *   - pagamento_pix        mostrou CNPJ, espera confirmacao
 *   - pagamento_boleto     informou que sera enviado, modo humano
 *   - coleta_parceria      coletando dados de parceria
 *   - coleta_atendente     coletando duvida inicial
 *   - sonnar               submenu Sonnar (Assinar, Guia, Consultoria)
 *   - sonnar_assinar       Grupo vs Personalizado
 *   - closing_check        "conseguiu resolver?"
 *
 * Transicoes pra atendimento humano:
 *   - opcao 1 (orcamento)        apos coleta_orcamento + closing_check
 *   - opcao 2 (reuniao)          apos coleta_reuniao + closing_check
 *   - opcao 3.2 (boleto)         direto, modo humano
 *   - opcao 3.1 (pix)            apos confirmacao do cliente
 *   - opcao 4 (parceria)         apos coleta_parceria + closing_check
 *   - opcao 6 (atendente)        apos coleta_atendente
 *   - guia (Pro/Plus)            direto
 *   - consultoria (Plus)         direto
 */

import {
  detectIntent,
  detectPaymentChoice,
  detectClosingChoice,
  detectYesNo,
  isBackCommand,
  isGreeting,
  normalize,
} from "./intentDetector.js"

const PIX_CNPJ = "64.095.868/0001-03"

// ──────────────────────────────────────────────────────────────────────
// Textos (padrao Apple - limpos, organizados, sem excesso)
// ──────────────────────────────────────────────────────────────────────

const ROOT_MENU =
  `*Elkys*\n` +
  `Software, automação e produtos digitais.\n\n` +
  `https://elkys.com.br\n\n` +
  `Como podemos te ajudar?\n\n` +
  `*1.* Orçamento\n` +
  `*2.* Agendar reunião\n` +
  `*3.* Boleto ou Pix\n` +
  `*4.* Seja parceiro\n` +
  `*5.* Sonnar - Vagas de tecnologia\n` +
  `*6.* Falar com atendente\n\n` +
  `_Responda com o número da opção._`

const NOT_UNDERSTOOD =
  `Não consegui entender. Tente novamente:\n\n` +
  `• Responda com o *número* da opção (1 a 6)\n` +
  `• Ou escreva o que precisa (ex.: orçamento, pagamento, vagas)\n\n` +
  `_Digite *menu* a qualquer momento pra voltar._`

const ORCAMENTO_COLETA =
  `*Orçamento personalizado*\n\n` +
  `Para preparar uma proposta sob medida, me conta um pouco do projeto. ` +
  `Pode responder tudo numa mensagem só:\n\n` +
  `• O que você quer construir ou resolver\n` +
  `• Quem vai usar e quantos usuários\n` +
  `• Prazo desejado\n` +
  `• Orçamento estimado (se já tem em mente)\n` +
  `• Referências ou links úteis\n\n` +
  `_Texto, por favor. Sem áudio._`

const REUNIAO_COLETA =
  `*Agendar reunião*\n\n` +
  `Reunião online (Google Meet), gratuita e sem compromisso. Me passe:\n\n` +
  `• Seu nome completo\n` +
  `• Empresa (se tiver)\n` +
  `• Três horários que funcionam pra você\n` +
  `• Resumo do que quer conversar`

const PARCERIA_COLETA =
  `*Programa de parceiros Elkys*\n\n` +
  `Pra entender a oportunidade, me conta:\n\n` +
  `• Seu nome e empresa\n` +
  `• Que tipo de parceria você imagina\n` +
  `   Indicação · Co-criação · White label · Outra\n` +
  `• Volume estimado de projetos por mês\n` +
  `• Sua área de atuação principal`

const ATENDENTE_COLETA =
  `*Atendimento humano*\n\n` +
  `Pra agilizar, me conta em uma mensagem sua dúvida ou o que precisa.\n\n` +
  `_Texto, por favor. Sem áudio._`

const PAGAMENTO_MENU =
  `*Pagamento*\n\n` +
  `Como você prefere pagar?\n\n` +
  `*1.* Pix\n` +
  `*2.* Boleto bancário\n\n` +
  `_Responda com o número._`

const PAGAMENTO_PIX = (cnpj) =>
  `*Pix Elkys*\n\n` +
  `*CNPJ:* ${cnpj}\n` +
  `*Beneficiário:* ELKYS\n\n` +
  `Após pagar, me confirma por aqui que valido com o financeiro ` +
  `e libero o comprovante e nota fiscal.`

const PAGAMENTO_BOLETO =
  `*Boleto*\n\n` +
  `Em instantes vou te enviar o boleto por *email* e por *WhatsApp* aqui mesmo.\n\n` +
  `Se precisar de algo enquanto isso, é só responder por aqui.`

// Closing check após coletas
const CLOSING_CHECK = (afterTopic = "isso") =>
  `Recebi! Vou repassar pro time.\n\n` +
  `Como você prefere seguir?\n\n` +
  `*1.* Falar com um atendente agora\n` +
  `*2.* Aguardar nosso retorno\n\n` +
  `_Em até 24 horas úteis te chamamos por aqui._`

// Submenu Sonnar (mantém similar ao atual mas com formatação Apple)
const SONNAR_MENU =
  `*Sonnar*\n` +
  `Sua próxima vaga de tecnologia, sem garimpar.\n\n` +
  `https://sonnarjobs.com.br\n\n` +
  `*Por que usar*\n` +
  `• Vagas que batem com sua stack e senioridade\n` +
  `• Recebe assim que a vaga é publicada\n` +
  `• Filtro por área, modalidade e localização\n` +
  `• Tudo no WhatsApp - sem app, sem login\n\n` +
  `O que você quer fazer?\n\n` +
  `*1.* Assinar\n` +
  `*2.* Guia do candidato  _(Pro e Plus)_\n` +
  `*3.* Consultoria LinkedIn e Currículo  _(Plus)_\n` +
  `*0.* Voltar ao menu principal\n\n` +
  `_Responda com o número da opção._`

const SONNAR_ASSINAR_MENU =
  `*Como você quer receber as vagas?*\n\n` +
  `*1.* Grupo de vagas  - as vagas do dia em um grupo exclusivo\n` +
  `*2.* Vagas personalizadas  - só o que combina com seu perfil, no privado\n\n` +
  `Mais sobre os planos: https://sonnarjobs.com.br\n\n` +
  `_Responda com o número • ou *voltar*._`

const SONNAR_ASSINAR_GRUPO =
  `*Grupo de vagas*\n\n` +
  `Pra entrar no grupo exclusivo, escolha um plano (Pro ou Plus) ` +
  `e siga o link de convite enviado após o cadastro.\n\n` +
  `https://sonnarjobs.com.br/cadastro\n\n` +
  `Precisa de ajuda? Responda *atendente*.\n\n` +
  `_Digite *menu* pra voltar._`

const SONNAR_ASSINAR_PRIVADO =
  `*Vagas personalizadas*\n\n` +
  `Plano *Plus* - só o que combina com seu stack, senioridade, ` +
  `modalidade e localização, no seu privado.\n\n` +
  `https://sonnarjobs.com.br/cadastro\n\n` +
  `Precisa de ajuda? Responda *atendente*.\n\n` +
  `_Digite *menu* pra voltar._`

const PLAN_NOT_ELIGIBLE = {
  guia: (planLabel) =>
    `O *Guia do Candidato* é exclusivo dos planos *Pro* e *Plus*.\n\n` +
    `Você está no plano *${planLabel || "Comunidade"}* hoje. ` +
    `Faça upgrade que destravamos tudo:\n\n` +
    `https://sonnarjobs.com.br/dashboard/configuracoes?tab=assinatura\n\n` +
    `_Digite *menu* pra voltar._`,
  consultoria: (planLabel) =>
    `A *Consultoria de LinkedIn e Currículo* é exclusiva do plano *Plus*.\n\n` +
    `Você está no plano *${planLabel || "Comunidade"}* hoje.\n\n` +
    `https://sonnarjobs.com.br/dashboard/configuracoes?tab=assinatura\n\n` +
    `_Digite *menu* pra voltar._`,
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function planLabel(plan) {
  if (plan === "plus") return "Plus"
  if (plan === "pro") return "Pro"
  return "Comunidade"
}

/**
 * Constroi a transition pra humano com mensagem original + categoria.
 */
function makeHumanTransition(opts) {
  return {
    type: "human",
    category: opts.category || "outro",
    priority: opts.priority || "media",
    subject: opts.subject,
    notify: opts.notify,
    keepClosingMessage: opts.keepClosingMessage,
  }
}

// ──────────────────────────────────────────────────────────────────────
// API: routeMessage
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide a proxima acao do bot com base no estado da conversa.
 *
 * Estados aqui processados:
 *   root, coleta_*, menu_pagamento, pagamento_pix, sonnar*, closing_check
 *
 * Em coleta_*, a mensagem do cliente vira o conteudo do ticket.
 *
 * @param {Object} opts
 * @returns {{
 *   reply: string,
 *   nextMenu: string,
 *   transition?: object,
 *   collectedMessage?: string,   // texto que vai virar body do ticket
 *   pixCNPJ?: string,            // sinaliza copia pra cliente
 * }}
 */
export function routeMessage({ text, currentMenu, contact, context = {} }) {
  // Comando global pra voltar ao menu raiz
  if (isBackCommand(text) && currentMenu !== "root") {
    return { reply: ROOT_MENU, nextMenu: "root" }
  }

  switch (currentMenu) {
    case "root":
    default:
      return handleRoot(text, contact)
    case "menu_pagamento":
      return handleMenuPagamento(text)
    case "pagamento_pix":
      return handlePagamentoPixWait(text)
    case "coleta_orcamento":
      return handleColeta(text, "orcamento")
    case "coleta_reuniao":
      return handleColeta(text, "reuniao")
    case "coleta_parceria":
      return handleColeta(text, "parceria")
    case "coleta_atendente":
      return handleColeta(text, "atendente")
    case "closing_check":
      return handleClosingCheck(text, context)
    case "sonnar":
      return handleSonnar(text, contact)
    case "sonnar_assinar":
      return handleSonnarAssinar(text)
  }
}

export function getRootMenuText() {
  return ROOT_MENU
}

// ──────────────────────────────────────────────────────────────────────
// Handler: menu raiz
// ──────────────────────────────────────────────────────────────────────

function handleRoot(text, contact) {
  if (isGreeting(text)) {
    return { reply: ROOT_MENU, nextMenu: "root" }
  }

  const intent = detectIntent(text)
  switch (intent) {
    case "orcamento":
      return { reply: ORCAMENTO_COLETA, nextMenu: "coleta_orcamento" }
    case "reuniao":
      return { reply: REUNIAO_COLETA, nextMenu: "coleta_reuniao" }
    case "pagamento":
      return { reply: PAGAMENTO_MENU, nextMenu: "menu_pagamento" }
    case "parceria":
      return { reply: PARCERIA_COLETA, nextMenu: "coleta_parceria" }
    case "sonnar":
      return { reply: SONNAR_MENU, nextMenu: "sonnar" }
    case "atendente":
      return { reply: ATENDENTE_COLETA, nextMenu: "coleta_atendente" }
    case "voltar":
      return { reply: ROOT_MENU, nextMenu: "root" }
    default:
      // Sem intent reconhecido - mostra orientacao
      return { reply: NOT_UNDERSTOOD, nextMenu: "root" }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Handler: menu pagamento (PIX vs Boleto)
// ──────────────────────────────────────────────────────────────────────

function handleMenuPagamento(text) {
  const choice = detectPaymentChoice(text)
  if (choice === "pix") {
    return {
      reply: PAGAMENTO_PIX(PIX_CNPJ),
      nextMenu: "pagamento_pix",
      pixCNPJ: PIX_CNPJ,
    }
  }
  if (choice === "boleto") {
    // Boleto entra DIRETO em modo humano - admin envia manualmente.
    return {
      reply: PAGAMENTO_BOLETO,
      nextMenu: "human",
      transition: makeHumanTransition({
        category: "financeiro",
        priority: "alta",
        subject: "Solicitação de boleto (WhatsApp)",
        notify: "📄 *Boleto solicitado*  - cliente aguardando envio por email + WhatsApp",
        keepClosingMessage: true,
      }),
      collectedMessage: "Cliente solicitou BOLETO via WhatsApp. Enviar boleto por email e por aqui.",
    }
  }
  return {
    reply: `Não entendi. Responda *1* pra Pix ou *2* pra Boleto.\n\n_Digite *menu* pra voltar._`,
    nextMenu: "menu_pagamento",
  }
}

// ──────────────────────────────────────────────────────────────────────
// Handler: pix aguardando confirmacao
// ──────────────────────────────────────────────────────────────────────

function handlePagamentoPixWait(text) {
  // Qualquer texto aqui eh tratado como confirmacao/duvida do cliente
  // Vai pra humano com nota do que cliente disse
  return {
    reply:
      `Recebi! Vou validar com o financeiro e te confirmo aqui.\n\n` +
      `Após confirmação, envio o comprovante e nota fiscal.`,
    nextMenu: "human",
    transition: makeHumanTransition({
      category: "financeiro",
      priority: "alta",
      subject: "Confirmação de Pix (WhatsApp)",
      notify: "💸 *Pix realizado*  - cliente confirmou pagamento, validar e enviar NF",
      keepClosingMessage: true,
    }),
    collectedMessage: text,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Handler: coletas (orcamento, reuniao, parceria, atendente)
// ──────────────────────────────────────────────────────────────────────

const COLETA_LABELS = {
  orcamento:  { subject: "Orçamento (WhatsApp)",            notify: "💼 *Orçamento solicitado*",     category: "outro" },
  reuniao:    { subject: "Agendamento de reunião",          notify: "📅 *Reunião solicitada*",        category: "outro" },
  parceria:   { subject: "Programa de parceiros",           notify: "🤝 *Parceria solicitada*",       category: "outro" },
  atendente:  { subject: "Atendimento (WhatsApp)",          notify: "💬 *Atendente solicitado*",      category: "duvida" },
}

function handleColeta(text, topic) {
  const collected = (text || "").trim()
  // Cliente digitou algo curto/menu? Mostra menu
  const norm = normalize(collected)
  if (isBackCommand(collected) || norm === "voltar") {
    return { reply: ROOT_MENU, nextMenu: "root" }
  }
  if (collected.length < 5) {
    // Muito curto - pede pra elaborar
    return {
      reply:
        `Pode dar mais detalhes? Quanto mais informação, mais rápido o atendimento.\n\n` +
        `_Digite *menu* pra cancelar._`,
      nextMenu: `coleta_${topic}`,
    }
  }

  // Recebeu a mensagem. Pergunta o closing_check.
  return {
    reply: CLOSING_CHECK(topic),
    nextMenu: "closing_check",
    collectedMessage: collected,
    // contextPatch propagado pelo incomingHandler - guarda quem disparou
    contextPatch: {
      coleta_topic: topic,
      coleta_message: collected,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────
// Handler: closing_check
// ──────────────────────────────────────────────────────────────────────

function handleClosingCheck(text, context) {
  const choice = detectClosingChoice(text)
  const topic = context?.coleta_topic || "atendente"
  const labels = COLETA_LABELS[topic] || COLETA_LABELS.atendente
  const collected = context?.coleta_message || ""

  if (choice === "atendente") {
    return {
      reply:
        `Perfeito. Um atendente vai te responder em instantes por aqui mesmo.\n\n` +
        `_Atendimento automático pausado._`,
      nextMenu: "human",
      transition: makeHumanTransition({
        ...labels,
        priority: "alta",
        keepClosingMessage: true,
      }),
      collectedMessage: collected,
    }
  }

  if (choice === "ok") {
    return {
      reply:
        `Beleza! Em até *24 horas úteis* nosso time entra em contato por aqui.\n\n` +
        `Se preferir adiantar, responda *atendente* a qualquer momento.\n\n` +
        `_Atendimento automático pausado até finalizarmos._`,
      nextMenu: "human",
      transition: makeHumanTransition({
        ...labels,
        priority: "media",
        keepClosingMessage: true,
      }),
      collectedMessage: collected,
    }
  }

  // Cliente digitou outra coisa - repete a pergunta
  return {
    reply:
      `Como prefere seguir?\n\n` +
      `*1.* Falar com atendente agora\n` +
      `*2.* Aguardar retorno (até 24h úteis)`,
    nextMenu: "closing_check",
  }
}

// ──────────────────────────────────────────────────────────────────────
// Handler: Sonnar (mesmo do antigo mas reformatado)
// ──────────────────────────────────────────────────────────────────────

function handleSonnar(text, contact) {
  const norm = normalize(text)
  const num = norm.match(/^([0-3])\b/)?.[1]

  if (num === "0" || norm === "voltar") {
    return { reply: ROOT_MENU, nextMenu: "root" }
  }

  // 1. Assinar
  if (num === "1" || /\bassinar\b/.test(norm)) {
    return { reply: SONNAR_ASSINAR_MENU, nextMenu: "sonnar_assinar" }
  }

  // 2. Guia (Pro/Plus)
  if (num === "2" || /\bguia\b/.test(norm)) {
    const plan = contact?.subscriberPlan
    if (plan !== "pro" && plan !== "plus") {
      return { reply: PLAN_NOT_ELIGIBLE.guia(planLabel(plan)), nextMenu: "sonnar" }
    }
    return {
      reply:
        `*Guia do candidato*\n\n` +
        `Para montar um guia que faça sentido pra você, vamos agendar uma conversa rápida.\n\n` +
        `Me conta:\n` +
        `• Seu nome\n` +
        `• Cargo / área que quer trabalhar\n` +
        `• Anos de experiência\n` +
        `• 3 empresas ou tipos de vaga que você está mirando\n\n` +
        `Em até 24h te chamamos pra alinhar e gerar o material personalizado.`,
      nextMenu: "coleta_orcamento", // reusa coleta + closing
      contextPatch: { coleta_topic: "atendente" },
    }
  }

  // 3. Consultoria (Plus)
  if (num === "3" || /\bconsultoria\b/.test(norm)) {
    const plan = contact?.subscriberPlan
    if (plan !== "plus") {
      return { reply: PLAN_NOT_ELIGIBLE.consultoria(planLabel(plan)), nextMenu: "sonnar" }
    }
    return {
      reply:
        `*Consultoria LinkedIn + Currículo*\n\n` +
        `O Lucelho entra na sua tela e otimiza tudo junto com você, pra área que ` +
        `quer trabalhar.\n\n` +
        `Pra agendar, me passa:\n` +
        `• Seu nome\n` +
        `• URL do seu LinkedIn\n` +
        `• Foco: qual área/vaga você está mirando\n` +
        `• 3 horários que funcionam pra você`,
      nextMenu: "coleta_atendente",
    }
  }

  return { reply: SONNAR_MENU, nextMenu: "sonnar" }
}

function handleSonnarAssinar(text) {
  const norm = normalize(text)
  const num = norm.match(/^([0-2])\b/)?.[1]
  if (num === "0" || norm === "voltar") {
    return { reply: SONNAR_MENU, nextMenu: "sonnar" }
  }
  if (num === "1" || /\bgrupo\b/.test(norm)) {
    return { reply: SONNAR_ASSINAR_GRUPO, nextMenu: "sonnar_assinar" }
  }
  if (num === "2" || /\bpersonalizada/.test(norm) || /\bprivado\b/.test(norm)) {
    return { reply: SONNAR_ASSINAR_PRIVADO, nextMenu: "sonnar_assinar" }
  }
  return { reply: SONNAR_ASSINAR_MENU, nextMenu: "sonnar_assinar" }
}

// Exporta constantes pra testes
export const _internals = {
  ROOT_MENU,
  ORCAMENTO_COLETA,
  PIX_CNPJ,
  PAGAMENTO_PIX,
  CLOSING_CHECK,
}
