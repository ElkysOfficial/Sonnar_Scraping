/**
 * Este script é responsável
 * por carregar os eventos
 * que serão escutados pelo
 * socket do WhatsApp.
 *
 * @author Dev Gui
 */
import { TIMEOUT_IN_MILLISECONDS_BY_EVENT, USE_CARD_SENDER, ENABLE_API_RECEIVER } from "./config.js";
import { onMessagesUpsert } from "./middlewares/onMesssagesUpsert.js";
import { badMacHandler } from "./utils/badMacHandler.js";
import { errorLog, infoLog } from "./utils/logger.js";
import { startJobSender } from "./services/jobSender.js";
import { startVipJobSender } from "./services/vipJobSender.js";
import { startCardSender } from "./services/cardJobSender.js";
import { startApiReceiver } from "./services/apiReceiver.js";

export function load(socket) {
  const safeEventHandler = async (callback, data, eventName) => {
    try {
      await callback(data);
    } catch (error) {
      if (badMacHandler.handleError(error, eventName)) {
        return;
      }
      errorLog(`Erro ao processar evento ${eventName}: ${error.message}`);
      if (error.stack) {
        errorLog(`Stack trace: ${error.stack}`);
      }
    }
  };

  socket.ev.on("messages.upsert", async (data) => {
    const startProcess = Date.now();
    setTimeout(() => {
      safeEventHandler(
        () =>
          onMessagesUpsert({
            socket,
            messages: data.messages,
            startProcess,
          }),
        data,
        "messages.upsert"
      );
    }, TIMEOUT_IN_MILLISECONDS_BY_EVENT);
  });

  process.on("uncaughtException", (error) => {
    if (badMacHandler.handleError(error, "uncaughtException")) {
      return;
    }
    errorLog(`Erro não capturado: ${error.message}`);
  });

  process.on("unhandledRejection", (reason) => {
    if (badMacHandler.handleError(reason, "unhandledRejection")) {
      return;
    }
    errorLog(`Promessa rejeitada não tratada: ${reason}`);
  });

  // Inicia o serviço de envio automático de vagas (DESABILITADO - usando cards com imagem)
  // startJobSender(socket);

  // Inicia o serviço de vagas VIP (personalizadas)
  startVipJobSender(socket).catch((error) => {
    errorLog(`Erro ao iniciar serviÃ§o VIP: ${error.message}`);
  });

  // Inicia o serviço de envio de cards (imagens com caption)
  infoLog("Card sender enabled, starting service...");
  startCardSender();

  // Inicia o servidor de API para receber mensagens externas
  if (ENABLE_API_RECEIVER) {
    infoLog("API receiver enabled, starting server...");
    startApiReceiver();
  }
}
