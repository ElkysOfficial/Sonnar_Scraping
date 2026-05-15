/**
 * Gerenciador de socket global
 * Mantém uma referência atualizada do socket atual para uso em serviços
 * que precisam continuar funcionando após reconexões.
 *
 * @author Sonar Bot
 */

let currentSocket = null
let isConnected = false

/**
 * Define o socket atual
 * @param {Object} socket - Socket do Baileys
 */
export function setCurrentSocket(socket) {
  currentSocket = socket
}

/**
 * Define o estado de conexão
 * @param {boolean} connected - Estado da conexão
 */
export function setConnectionState(connected) {
  isConnected = connected
}

/**
 * Obtém o socket atual
 * @returns {Object|null} Socket do Baileys ou null
 */
export function getCurrentSocket() {
  return currentSocket
}

/**
 * Verifica se o socket atual está pronto para uso
 * @returns {boolean}
 */
export function isCurrentSocketReady() {
  // Verifica se temos socket
  if (!currentSocket) {
    return false
  }

  // Primeiro verifica o flag de conexão
  if (isConnected) {
    return true
  }

  // Fallback: verifica estado do WebSocket diretamente
  // readyState 1 = OPEN
  if (currentSocket.ws?.readyState === 1) {
    return true
  }

  // Verifica se o socket tem user definido (indicador de conexão ativa no Baileys)
  if (currentSocket.user?.id) {
    return true
  }

  return false
}
