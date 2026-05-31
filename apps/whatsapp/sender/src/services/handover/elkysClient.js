/**
 * Cliente Supabase do banco Elkys (cross-DB).
 *
 * Usado pelo sistema de atendimento humano (v3.10.23) pra:
 *   - Identificar clientes Elkys conhecidos por telefone
 *   - Criar/atualizar tickets em support_tickets
 *   - Criar leads novos quando o numero nao eh conhecido
 *   - Gerir estado das conversas em whatsapp_conversations
 *
 * O cliente do Sonnar (sender ja usa) continua intacto — este eh um
 * cliente ADICIONAL, em paralelo.
 */
import { createClient } from "@supabase/supabase-js"
import { ELKYS_SUPABASE_URL, ELKYS_SUPABASE_SERVICE_KEY } from "../../config.js"
import { errorLog, warningLog } from "../../utils/logger.js"

let _client = null

/**
 * Devolve um singleton do cliente Elkys. Lazy init pra nao crashar
 * o bot quando as env vars nao estao configuradas em dev.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient | null}
 */
export function getElkysClient() {
  if (_client) return _client
  if (!ELKYS_SUPABASE_URL || !ELKYS_SUPABASE_SERVICE_KEY) {
    warningLog(
      "[elkysClient] ELKYS_SUPABASE_SERVICE_KEY ausente — atendimento humano desabilitado nesta instancia.",
    )
    return null
  }
  try {
    _client = createClient(ELKYS_SUPABASE_URL, ELKYS_SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return _client
  } catch (err) {
    errorLog(`[elkysClient] falha ao criar cliente: ${err.message}`)
    return null
  }
}

/**
 * Verifica se o cliente Elkys esta configurado e disponivel.
 */
export function isElkysAvailable() {
  return Boolean(getElkysClient())
}
