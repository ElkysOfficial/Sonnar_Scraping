import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// Intervalo de envio em ms (5 minutos)
export const JOB_SEND_INTERVAL = 5 * 60 * 1000

// Caminho do arquivo de vagas (embeds.json)
export const EMBEDS_FILE_PATH = path.resolve(__dirname, "..", "..", "message_formatting", "discord", "src", "data", "embeds.json")

// ======= CONFIGURAÇÕES DA ELKYS =======
// Número da Elkys (formato: numero@s.whatsapp.net ou numero@lid)
export const ELKYS_NUMBER = "5531983244210@s.whatsapp.net"

// Números para notificação de orçamento (um por linha para fácil edição)
// Para adicionar mais números, copie e cole uma linha e substitua o número
// Exemplo: "120152280592452@lid"
export const ORCAMENTO_NUMBERS = [
  "120152280592452@lid",
  "5953026035805@lid",
  "209590629191798@lid",
  "5531972624740@s.whatsapp.net",
  "5531998478235@s.whatsapp.net"
]

// Números para notificação de pagamento (um por linha para fácil edição)
// Para adicionar mais números, copie e cole uma linha e substitua o número
export const PAYMENT_NOTIFICATION_NUMBERS = ["120152280592452@lid", "5953026035805@lid", "209590629191798@lid"]

// Link do Google Calendar para agendamento
export const CALENDAR_LINK = "https://calendar.app.google/aL3PxrCWRYVBxRkD7"

// Links de pagamento Mercado Pago
export const PAYMENT_LINK_GROUP = "https://buy.stripe.com/9B68wI4uY23P2FW5qkbfO00"
export const PAYMENT_LINK_PRIVATE = "https://buy.stripe.com/14AcMY2mQbEpcgwg4YbfO01"

// Link do grupo de vagas (será enviado após confirmação de pagamento)
export const JOB_GROUP_LINK = "https://chat.whatsapp.com/HGtEZLt5jys7aOONUUhF6a"
