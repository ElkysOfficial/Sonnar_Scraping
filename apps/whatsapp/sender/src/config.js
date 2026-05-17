import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carrega o .env do bot ANTES de avaliar as constantes abaixo.
// Sem isso, process.env fica vazio na hora que este modulo eh avaliado
// (a ordem de import nao garante que o dotenv ja rodou) e variaveis como
// WEB_FUNCTIONS_URL / WHATSAPP_LINK_SECRET caem no fallback "".
dotenv.config({ path: path.resolve(__dirname, "..", ".env") })

const readNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const readBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback
  }
  if (typeof value === "boolean") {
    return value
  }
  const normalized = value.toString().trim().toLowerCase()
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

// Prefixo padrão dos comandos.
export const PREFIX = "/"

// Emoji do bot (mude se preferir).
export const BOT_EMOJI = "🤖"

// Nome do bot (mude se preferir).
export const BOT_NAME = "Sonar Bot"

// LID do bot.
// Para obter o LID do bot, use o comando <prefixo>lid respondendo em cima de uma mensagem do número do bot
// Troque o <prefixo> pelo prefixo do bot (ex: /lid).
export const BOT_LID = "220676074017018@lid"

// LID do dono do bot.
// Para obter o LID do dono do bot, use o comando <prefixo>meu-lid
// Troque o <prefixo> pelo prefixo do bot (ex: /meu-lid).
export const OWNER_LID = "120152280592452@lid"

// Diretório dos comandos
export const COMMANDS_DIR = path.join(__dirname, "commands")

// Diretório de arquivos de mídia.
export const DATABASE_DIR = path.resolve(__dirname, "..", "database")

// Diretório de arquivos de mídia.
export const ASSETS_DIR = path.resolve(__dirname, "..", "assets")

// Diretório de arquivos temporários.
export const TEMP_DIR = path.resolve(__dirname, "..", "assets", "temp")

// Timeout em milissegundos por evento (evita banimento).
export const TIMEOUT_IN_MILLISECONDS_BY_EVENT = 700

// Plataforma de API's
export const SPIDER_API_BASE_URL = "https://api.spiderx.com.br/api"

// Obtenha seu token, criando uma conta em: https://api.spiderx.com.br.
export const SPIDER_API_TOKEN = "seu_token_aqui"

// Plataforma de geração de links a partir de imagens
export const LINKER_BASE_URL = "https://linker.devgui.dev/api"

// Obtenha sua chave em: https://linker.devgui.dev.
export const LINKER_API_KEY = "seu_token_aqui"

// Caso queira responder apenas um grupo específico,
// coloque o ID dele na configuração abaixo.
// Para saber o ID do grupo, use o comando <prefixo>get-group-id
// Troque o <prefixo> pelo prefixo do bot (ex: /get-group-id).
export const ONLY_GROUP_ID = ""

// Configuração para modo de desenvolvimento
// mude o valor para ( true ) sem os parênteses
// caso queira ver os logs de mensagens recebidas
export const DEVELOPER_MODE = false

// Nivel de log padrao (talk, input, info, success, warning, error, none)
export const LOG_LEVEL = process.env.LOG_LEVEL || 'success'

// Caso queira usar proxy.
export const PROXY_PROTOCOL = "http"
export const PROXY_HOST = ""
export const PROXY_PORT = ""
export const PROXY_USERNAME = ""
export const PROXY_PASSWORD = ""

// Versão do WhatsApp Web
export const WAWEB_VERSION = [2, 3000, 1031821793]

// Chave da OpenAI para o comando de suporte
export const OPENAI_API_KEY = ""

// ======= CONFIGURAÇÕES DO SERVIÇO DE VAGAS =======
// ID do grupo para envio de vagas (use /get-group-id para obter)
export const JOB_GROUP_ID = "120363421632065613@g.us"

// Intervalo de envio em ms (30 minutos - reduz egress do Supabase)
export const JOB_SEND_INTERVAL = 30 * 60 * 1000

// ======= CONFIGURAÇÕES DE MATCHING VIP =======
// Janela de busca (em dias) para reduzir scans completos (0 = desabilita filtro)
// Aumentado para 45 dias para compensar matching sem description
export const VIP_JOB_LOOKBACK_DAYS = readNumber(process.env.VIP_JOB_LOOKBACK_DAYS, 45)

// Limite de vagas carregadas por ciclo (0 = sem limite)
// Aumentado para 2000 para melhorar chances de match
export const VIP_MAX_JOBS_PER_CYCLE = readNumber(process.env.VIP_MAX_JOBS_PER_CYCLE, 2000)

// Fallback caso a janela fique vazia (0 = desabilita fallback)
export const VIP_FALLBACK_MAX_JOBS = readNumber(process.env.VIP_FALLBACK_MAX_JOBS, 3000)

// Fallback adicional: varredura completa quando não houver match
export const VIP_ENABLE_FULL_SCAN_FALLBACK = readBoolean(process.env.VIP_ENABLE_FULL_SCAN_FALLBACK, true)
export const VIP_FULL_SCAN_PAGE_SIZE = readNumber(process.env.VIP_FULL_SCAN_PAGE_SIZE, 1000)

// Diagnóstico por assinatura (logs de motivos de reprovação)
export const VIP_ENABLE_DIAGNOSTICS = readBoolean(process.env.VIP_ENABLE_DIAGNOSTICS, true)
export const VIP_DIAGNOSTIC_LOG_LIMIT = readNumber(process.env.VIP_DIAGNOSTIC_LOG_LIMIT, 8)

// Caminho do arquivo de vagas (embeds.json)
export const EMBEDS_FILE_PATH = path.resolve(__dirname, "..", "..", "..", "discord", "formatter", "src", "data", "embeds.json")

// ======= CONFIGURAÇÕES DA ELKYS =======
// Número da Elkys (formato: numero@s.whatsapp.net ou numero@lid)
export const ELKYS_NUMBER = "5531983244210@s.whatsapp.net"

// Números para notificação de orçamento (um por linha para fácil edição)
// Para adicionar mais números, copie e cole uma linha e substitua o número
// Exemplo: "120152280592452@lid"
export const ORCAMENTO_NUMBERS = [
  "5531998478235@s.whatsapp.net"
]

// Números para notificação de pagamento / aprovação de VIP.
// VAZIO = ninguém recebe a aprovação de VIP (fluxo manual sem aprovador).
export const PAYMENT_NOTIFICATION_NUMBERS = []

// Link do Google Calendar para agendamento
export const CALENDAR_LINK = "https://calendar.app.google/aL3PxrCWRYVBxRkD7"

// Links de pagamento Mercado Pago
export const PAYMENT_LINK_GROUP = "https://buy.stripe.com/9B68wI4uY23P2FW5qkbfO00"
export const PAYMENT_LINK_PRIVATE = "https://buy.stripe.com/14AcMY2mQbEpcgwg4YbfO01"

// Link do grupo de vagas (será enviado após confirmação de pagamento)
export const JOB_GROUP_LINK = "https://chat.whatsapp.com/HGtEZLt5jys7aOONUUhF6a"

// ======= CONFIGURAÇÕES DO CARD SENDER =======
// Habilita o envio de cards com imagem (se false, usa apenas texto)
export const USE_CARD_SENDER = process.env.USE_CARD_SENDER === "true" || true

// URL da API de geração de cards
export const CARD_API_URL = process.env.CARD_API_URL || "http://localhost:3001"

// URL da API Core (job_data.json)
export const CORE_API_URL = process.env.CORE_API_URL || "http://localhost:3100"

// ======= CONFIGURAÇÕES DO API RECEIVER =======
// Habilita o servidor de API para receber mensagens externas
export const ENABLE_API_RECEIVER = process.env.ENABLE_API_RECEIVER === "true" || true

// Porta do servidor de API
export const WHATSAPP_API_PORT = process.env.WHATSAPP_API_PORT || 3002

// ======= CONFIGURAÇÕES DO CACHE JSON DE VAGAS =======
// Diretório para armazenar cache JSON de vagas VIP
export const VIP_CACHE_DIR = path.resolve(__dirname, "..", "database", "vip-jobs")

// TTL do cache VIP em ms (24 horas)
export const VIP_CACHE_TTL = 24 * 60 * 60 * 1000

// Quantidade de vagas para envio diário em grupos (30 em 30 min = 48 envios)
export const GROUP_JOBS_PER_DAY = 48

// ======= PAREAMENTO COM O PORTAL WEB =======
// URL base das edge functions do Supabase do PORTAL WEB (projeto diferente
// do Supabase do bot). Ex: https://<project>.supabase.co/functions/v1
export const WEB_FUNCTIONS_URL = process.env.WEB_FUNCTIONS_URL || ""

// Segredo compartilhado com a edge function link-whatsapp (header x-link-secret).
export const WHATSAPP_LINK_SECRET = process.env.WHATSAPP_LINK_SECRET || ""
