/**
 * menuRouter — fluxos conversacionais do bot Elkys + Sonnar.
 *
 * Estrutura em arvore:
 *   root                    → menu Elkys (5 opcoes)
 *     ├── orcamento         → coleta info + abre atendimento
 *     ├── reuniao           → coleta disponibilidade + abre atendimento
 *     ├── sonnar            → submenu Sonnar
 *     │     ├── assinar     → escolhe Grupo ou Personalizadas
 *     │     ├── guia        → abre atendimento (precisa conversa pra montar)
 *     │     └── consultoria → abre atendimento (Plus only)
 *     ├── parceria          → coleta info + abre atendimento
 *     └── atendente         → abre atendimento direto
 *
 * Cada handler retorna:
 *   { reply: string, nextMenu: string, transition?: 'human'|'awaiting_rating' }
 *
 * Quando `transition === 'human'`, o orchestrator (humanHandover) cuida de:
 *   - criar ticket
 *   - mudar mode pra 'human'
 *   - notificar admins
 */

const SEP = "─".repeat(28)

// ─── Menu raiz: Elkys ───────────────────────────────────────────────

const ROOT_MENU_TEXT =
  `*ELKYS* ⚙️\n` +
  `_Software, automação e produtos digitais._\n\n` +
  `Construímos tecnologia que faz negócio crescer — de sistemas sob ` +
  `medida a automações que devolvem horas do seu dia.\n\n` +
  `🌐 https://elkys.com.br\n` +
  `${SEP}\n` +
  `*Como podemos te ajudar?*\n\n` +
  `1️⃣  💼  *Orçamento*\n` +
  `Uma proposta sob medida para o seu projeto.\n\n` +
  `2️⃣  📅  *Reunião*\n` +
  `Converse com nosso time, sem compromisso.\n\n` +
  `3️⃣  🚀  *Sonnar — Vagas de tecnologia*\n` +
  `Vagas de TI direto no seu WhatsApp.\n\n` +
  `4️⃣  🤝  *Seja parceiro*\n` +
  `Indique projetos e cresça com a gente.\n\n` +
  `5️⃣  💬  *Conversar com um atendente*\n` +
  `Um humano vai te responder em breve.\n` +
  `${SEP}\n` +
  `_Responda com o número da opção._`

// ─── Submenu Sonnar ─────────────────────────────────────────────────

const SONNAR_MENU_TEXT =
  `*SONNAR* 🚀\n` +
  `_Sua próxima vaga de tecnologia, sem garimpar._\n\n` +
  `O Sonnar varre as principais plataformas de vagas, filtra o que ` +
  `combina com o seu perfil e entrega no WhatsApp — você não precisa ` +
  `procurar.\n\n` +
  `*Por que usar o Sonnar*\n` +
  `• 🎯 Vagas que batem com sua stack e senioridade\n` +
  `• ⚡ Você recebe assim que a vaga é publicada\n` +
  `• 🧭 Filtro por área, modalidade e localização\n` +
  `• 📲 Tudo no WhatsApp — sem app, sem login\n\n` +
  `🌐 https://sonnarjobs.com.br\n` +
  `${SEP}\n` +
  `*O que você quer fazer?*\n\n` +
  `1️⃣  ✍️  *Assinar*\n` +
  `Começar a receber vagas hoje.\n\n` +
  `2️⃣  📕  *Guia do Candidato*  _(Pro e Plus)_\n` +
  `Material personalizado pra você se posicionar melhor.\n\n` +
  `3️⃣  🎯  *Consultoria de LinkedIn e Currículo*  _(Plus)_\n` +
  `O time entra no seu perfil e otimiza junto com você.\n\n` +
  `0️⃣  ↩️  *Voltar ao menu principal*\n` +
  `${SEP}\n` +
  `_Responda com o número da opção._`

// ─── Submenu Assinar ────────────────────────────────────────────────

const SONNAR_ASSINAR_TEXT =
  `*Como você quer receber as vagas?*\n\n` +
  `1️⃣  👥  *Grupo de vagas*\n` +
  `As vagas do dia em um grupo exclusivo no WhatsApp.\n\n` +
  `2️⃣  🎯  *Vagas personalizadas*\n` +
  `Só o que combina com o seu perfil, no privado.\n\n` +
  `🌐 Conheça os planos: https://sonnarjobs.com.br\n` +
  `${SEP}\n` +
  `_Responda com o número • ou *voltar*._`

const SONNAR_ASSINAR_LINK =
  `🔗 *Vamos te direcionar pra começar:*\n` +
  `https://sonnarjobs.com.br/cadastro\n\n` +
  `Após o cadastro, configure seu perfil de busca e suas vagas começam ` +
  `a chegar automaticamente.\n\n` +
  `Quer que um atendente te ajude com o cadastro? Responda *atendente*.\n\n` +
  `_Digite *menu* a qualquer momento pra voltar._`

// ─── Mensagens de transicao pra atendimento ─────────────────────────

const TRANSITION_HUMAN = {
  generic: (name) =>
    `Recebi! 💬\n\n` +
    `Um atendente vai te responder em breve por aqui mesmo. ` +
    `Pode ficar à vontade pra mandar todos os detalhes que quiser ` +
    `enquanto isso — vamos te chamar em poucos minutos.\n\n` +
    `_O atendimento automático está pausado até finalizarmos sua solicitação._`,

  orcamento:
    `🧾 Vamos preparar um orçamento sob medida pra você.\n\n` +
    `Pra agilizar, descreva (pode ser em uma mensagem só):\n\n` +
    `• 🎯 O que você quer construir / resolver\n` +
    `• 🗓️ Prazo ideal\n` +
    `• 💰 Orçamento estimado (se já tem em mente)\n` +
    `• 🔗 Referências ou links úteis\n\n` +
    `Em até *24h úteis* um especialista da Elkys vai te responder com ` +
    `próximos passos.\n\n` +
    `_O atendimento automático está pausado até finalizarmos._`,

  reuniao:
    `📅 Bora marcar essa conversa.\n\n` +
    `Manda pra gente:\n\n` +
    `• 👤 Seu nome completo\n` +
    `• 🏢 Empresa (se tiver)\n` +
    `• ⏰ 3 horários que funcionam pra você (data e período)\n` +
    `• 💬 Resumo do que quer conversar\n\n` +
    `A reunião é online (Google Meet), sem compromisso. ` +
    `Confirmamos por aqui em até *24h úteis*.\n\n` +
    `_O atendimento automático está pausado até finalizarmos._`,

  parceria:
    `🤝 Bem-vindo ao programa de parceiros Elkys!\n\n` +
    `Conta pra gente:\n\n` +
    `• 👤 Seu nome e empresa\n` +
    `• 💼 Como você imagina a parceria (indicação, co-criação, white label, ...)\n` +
    `• 📊 Volume estimado de projetos/mês\n\n` +
    `Vamos te chamar em até *24h úteis* pra alinhar próximos passos.\n\n` +
    `_O atendimento automático está pausado até finalizarmos._`,

  sonnar_guia:
    `📕 Pra montar um guia que faça sentido, precisamos te conhecer um ` +
    `pouquinho.\n\n` +
    `Conta rapidinho:\n\n` +
    `• 👤 Seu nome\n` +
    `• 💼 Cargo / área que você quer trabalhar\n` +
    `• 📊 Anos de experiência\n` +
    `• 🎯 3 empresas/tipos de vaga que você está mirando\n\n` +
    `O time vai te chamar em até *24h* pra alinhar e gerar o guia ` +
    `personalizado.\n\n` +
    `_O atendimento automático está pausado até finalizarmos._`,

  sonnar_consultoria:
    `🎯 Consultoria personalizada de LinkedIn + Currículo.\n\n` +
    `O Lucelho (fundador da Sonnar) entra na sua tela com você e ` +
    `otimiza tudo juntos — pra área específica que você quer trabalhar.\n\n` +
    `Pra agendar, manda:\n\n` +
    `• 👤 Seu nome\n` +
    `• 🔗 URL do seu LinkedIn\n` +
    `• 🎯 Foco: qual área/vaga você está mirando\n` +
    `• ⏰ 3 horários que funcionam pra você\n\n` +
    `_O atendimento automático está pausado até finalizarmos._`,
}

const PLAN_NOT_ELIGIBLE = {
  guia: (planLabel) =>
    `🔒 O *Guia do Candidato* é exclusivo dos planos *Pro* e *Plus*.\n\n` +
    `Você está no plano *${planLabel || "Comunidade"}* hoje. ` +
    `Faz upgrade que destravamos tudo:\n\n` +
    `🌐 https://sonnarjobs.com.br/dashboard/configuracoes?tab=assinatura\n\n` +
    `_Digite *menu* pra voltar._`,

  consultoria: (planLabel) =>
    `🔒 A *Consultoria de LinkedIn e Currículo* é exclusiva do plano *Plus*.\n\n` +
    `Você está no plano *${planLabel || "Comunidade"}* hoje. ` +
    `O Plus inclui:\n\n` +
    `• Vagas filtradas no seu privado\n` +
    `• ✅/❌ por skill em cada vaga\n` +
    `• Upload e análise de CV (PDF/DOCX)\n` +
    `• Consultoria humana de LinkedIn + CV\n\n` +
    `🌐 https://sonnarjobs.com.br/dashboard/configuracoes?tab=assinatura\n\n` +
    `_Digite *menu* pra voltar._`,
}

// ─── Helpers de input ───────────────────────────────────────────────

function normalize(text) {
  return (text || "").trim().toLowerCase()
}

function isBackCommand(text) {
  const t = normalize(text)
  return t === "voltar" || t === "menu" || t === "sair" || t === "inicio" || t === "início" || t === "0"
}

// ─── API principal: routeMessage ───────────────────────────────────

/**
 * Decide a resposta do bot para uma mensagem recebida.
 *
 * @param {Object} opts
 * @param {string} opts.text     Texto cru do cliente
 * @param {string} opts.currentMenu  estado atual (root, sonnar, ...)
 * @param {Object} opts.contact  Resultado de lookupContact
 * @returns {{reply: string, nextMenu: string, transition?: {type: 'human', category: string, priority: string, subject: string}, askName?: boolean}}
 */
export function routeMessage({ text, currentMenu, contact }) {
  const norm = normalize(text)

  // Comandos universais
  if (isBackCommand(text) && currentMenu !== "root") {
    return { reply: ROOT_MENU_TEXT, nextMenu: "root" }
  }
  if (norm === "menu" || norm === "inicio" || norm === "início") {
    return { reply: ROOT_MENU_TEXT, nextMenu: "root" }
  }

  switch (currentMenu) {
    case "root":
    default:
      return handleRoot(norm, contact)
    case "sonnar":
      return handleSonnar(norm, contact)
    case "sonnar_assinar":
      return handleSonnarAssinar(norm)
  }
}

/**
 * Retorna o texto do menu raiz — usado pra "primeira mensagem do bot".
 */
export function getRootMenuText() {
  return ROOT_MENU_TEXT
}

// ─── Handlers ───────────────────────────────────────────────────────

function handleRoot(norm, contact) {
  switch (norm) {
    case "1":
    case "orcamento":
    case "orçamento":
      return {
        reply: TRANSITION_HUMAN.orcamento,
        nextMenu: "human",
        transition: {
          type: "human",
          category: "outro",
          priority: "media",
          subject: "Orçamento (WhatsApp)",
          notify: "💼 *Orçamento solicitado*",
        },
      }
    case "2":
    case "reuniao":
    case "reunião":
      return {
        reply: TRANSITION_HUMAN.reuniao,
        nextMenu: "human",
        transition: {
          type: "human",
          category: "outro",
          priority: "media",
          subject: "Agendamento de reunião (WhatsApp)",
          notify: "📅 *Reunião solicitada*",
        },
      }
    case "3":
    case "sonnar":
      return { reply: SONNAR_MENU_TEXT, nextMenu: "sonnar" }
    case "4":
    case "parceria":
    case "parceiro":
      return {
        reply: TRANSITION_HUMAN.parceria,
        nextMenu: "human",
        transition: {
          type: "human",
          category: "outro",
          priority: "media",
          subject: "Programa de parceiros (WhatsApp)",
          notify: "🤝 *Parceria solicitada*",
        },
      }
    case "5":
    case "atendente":
    case "atendimento":
    case "humano":
    case "falar":
      return {
        reply: TRANSITION_HUMAN.generic(contact?.displayName),
        nextMenu: "human",
        transition: {
          type: "human",
          category: "duvida",
          priority: "media",
          subject: "Atendimento solicitado (WhatsApp)",
          notify: "💬 *Cliente solicitou atendente*",
        },
      }
    default:
      // Primeira interacao ou input invalido: mostra menu
      return { reply: ROOT_MENU_TEXT, nextMenu: "root" }
  }
}

function handleSonnar(norm, contact) {
  switch (norm) {
    case "1":
    case "assinar":
      return { reply: SONNAR_ASSINAR_TEXT, nextMenu: "sonnar_assinar" }

    case "2":
    case "guia": {
      const plan = contact?.subscriberPlan
      if (plan !== "pro" && plan !== "plus") {
        return {
          reply: PLAN_NOT_ELIGIBLE.guia(planLabel(plan)),
          nextMenu: "sonnar",
        }
      }
      return {
        reply: TRANSITION_HUMAN.sonnar_guia,
        nextMenu: "human",
        transition: {
          type: "human",
          category: "outro",
          priority: "media",
          subject: "Guia do Candidato (Sonnar)",
          notify: `📕 *Guia do Candidato solicitado* (${plan})`,
        },
      }
    }

    case "3":
    case "consultoria": {
      const plan = contact?.subscriberPlan
      if (plan !== "plus") {
        return {
          reply: PLAN_NOT_ELIGIBLE.consultoria(planLabel(plan)),
          nextMenu: "sonnar",
        }
      }
      return {
        reply: TRANSITION_HUMAN.sonnar_consultoria,
        nextMenu: "human",
        transition: {
          type: "human",
          category: "outro",
          priority: "alta",
          subject: "Consultoria LinkedIn + CV (Sonnar Plus)",
          notify: "🎯 *Consultoria solicitada* (Plus)",
        },
      }
    }

    default:
      return { reply: SONNAR_MENU_TEXT, nextMenu: "sonnar" }
  }
}

function handleSonnarAssinar(norm) {
  switch (norm) {
    case "1":
    case "grupo":
      return {
        reply:
          `👥 *Grupo de vagas*\n\n` +
          `Pra entrar no grupo exclusivo, escolha um plano (Pro ou Plus) ` +
          `e siga o link de convite enviado após o cadastro:\n\n` +
          `🌐 https://sonnarjobs.com.br/cadastro\n\n` +
          `Quer ajuda? Responda *atendente*.\n\n` +
          `_Digite *menu* pra voltar._`,
        nextMenu: "sonnar_assinar",
      }
    case "2":
    case "personalizadas":
    case "privado":
      return {
        reply:
          `🎯 *Vagas personalizadas*\n\n` +
          `Plano *Plus* — receba só o que combina com seu stack, ` +
          `senioridade, modalidade e localização, no seu privado.\n\n` +
          `🌐 https://sonnarjobs.com.br/cadastro\n\n` +
          `Quer ajuda? Responda *atendente*.\n\n` +
          `_Digite *menu* pra voltar._`,
        nextMenu: "sonnar_assinar",
      }
    default:
      return { reply: SONNAR_ASSINAR_TEXT, nextMenu: "sonnar_assinar" }
  }
}

function planLabel(plan) {
  if (plan === "plus") return "Plus"
  if (plan === "pro") return "Pro"
  if (plan === "free") return "Comunidade"
  return "Comunidade"
}
