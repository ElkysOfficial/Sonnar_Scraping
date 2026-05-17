/**
 * Script de
 * inicialização do bot.
 *
 * Este script é
 * responsável por
 * iniciar a conexão
 * com o WhatsApp.
 *
 * Não é recomendado alterar
 * este arquivo,
 * a menos que você saiba
 * o que está fazendo.
 *
 * @author Dev Gui
 */
import makeWASocket, {
  DisconnectReason,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
  useMultiFileAuthState,
} from "baileys";
import NodeCache from "node-cache";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { PREFIX, TEMP_DIR, WAWEB_VERSION } from "./config.js";
import { load } from "./loader.js";
import { badMacHandler } from "./utils/badMacHandler.js";
import { onlyNumbers, question } from "./utils/index.js";
import {
  errorLog,
  infoLog,
  sayLog,
  successLog,
  warningLog,
} from "./utils/logger.js";
import { setCurrentSocket, setConnectionState } from "./utils/socketManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const logger = pino(
  { timestamp: () => `,"time":"${new Date().toJSON()}"` },
  pino.destination(path.join(TEMP_DIR, "wa-logs.txt"))
);

logger.level = "error";

const msgRetryCounterCache = new NodeCache();
let reconnectTimeoutId = null;
let reconnectAttempts = 0;

export async function connect() {
  const baileysFolder = path.resolve(
    __dirname,
    "..",
    "assets",
    "auth",
    "baileys"
  );

  const { state, saveCreds } = await useMultiFileAuthState(baileysFolder);

  const socket = makeWASocket({
    version: WAWEB_VERSION,
    logger,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 5000,
    auth: state,
    shouldIgnoreJid: (jid) =>
      isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
    connectTimeoutMs: 20_000,
    keepAliveIntervalMs: 30_000,
    maxMsgRetryCount: 5,
    markOnlineOnConnect: true,
    // Gera o cartao de preview (imagem + titulo) para URLs nas mensagens.
    // Requer a lib link-preview-js instalada.
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    emitOwnEvents: false,
    msgRetryCounterCache,
    shouldSyncHistoryMessage: () => false,
  });

  // Define socket global imediatamente (estado de conexão será atualizado no evento)
  setCurrentSocket(socket);

  if (!socket.authState.creds.registered) {
    warningLog("Credenciais ainda não configuradas!");

    infoLog('Informe o número de telefone do bot (exemplo: "5511920202020"):');

    const phoneNumber = await question("Informe o número de telefone do bot: ");

    if (!phoneNumber) {
      errorLog(
        'Número de telefone inválido! Tente novamente com o comando "npm start".'
      );

      process.exit(1);
    }

    const code = await socket.requestPairingCode(onlyNumbers(phoneNumber));

    // Exibe código de pareamento SEMPRE (não usa sayLog que pode ser filtrado)
    console.log("\n");
    console.log("╔════════════════════════════════════════════╗");
    console.log("║                                            ║");
    console.log(`║     📱 CÓDIGO DE PAREAMENTO: ${code}       ║`);
    console.log("║                                            ║");
    console.log("║  Digite este código no WhatsApp do celular ║");
    console.log("║  Configurações > Dispositivos conectados   ║");
    console.log("║  > Conectar dispositivo                    ║");
    console.log("║                                            ║");
    console.log("╚════════════════════════════════════════════╝");
    console.log("\n");
  }

  const scheduleReconnect = async () => {
    if (reconnectTimeoutId) {
      return;
    }
    const delayMs = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    reconnectAttempts += 1;
    reconnectTimeoutId = setTimeout(async () => {
      reconnectTimeoutId = null;
      const newSocket = await connect();
      load(newSocket);
    }, delayMs);
  };

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      // Marca conexão como fechada
      setConnectionState(false);
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;

      if (
        error?.message?.includes("Bad MAC") ||
        error?.toString()?.includes("Bad MAC")
      ) {
        errorLog("Bad MAC error na desconexão detectado");

        if (badMacHandler.handleError(error, "connection.update")) {
          if (badMacHandler.hasReachedLimit()) {
            warningLog(
              "Limite de erros Bad MAC atingido. Limpando arquivos de sessão problemáticos..."
            );
            badMacHandler.clearProblematicSessionFiles();
            badMacHandler.resetErrorCount();

            await scheduleReconnect();
            return;
          }
        }
      }

      if (statusCode === DisconnectReason.loggedOut) {
        errorLog("Bot desconectado!");
      } else {
        switch (statusCode) {
          case DisconnectReason.badSession:
            warningLog("Sessão inválida!");

            const sessionError = new Error("Bad session detected");
            if (badMacHandler.handleError(sessionError, "badSession")) {
              if (badMacHandler.hasReachedLimit()) {
                warningLog(
                  "Limite de erros de sessão atingido. Limpando arquivos de sessão..."
                );
                badMacHandler.clearProblematicSessionFiles();
                badMacHandler.resetErrorCount();
              }
            }
            break;
          case DisconnectReason.connectionClosed:
            warningLog("Conexão fechada!");
            break;
          case DisconnectReason.connectionLost:
            warningLog("Conexão perdida!");
            break;
          case DisconnectReason.connectionReplaced:
            warningLog("Conexão substituída!");
            break;
          case DisconnectReason.multideviceMismatch:
            warningLog("Dispositivo incompatível!");
            break;
          case DisconnectReason.forbidden:
            warningLog("Conexão proibida!");
            break;
          case DisconnectReason.restartRequired:
            infoLog('Me reinicie por favor! Digite "npm start".');
            break;
          case DisconnectReason.unavailableService:
            warningLog("Serviço indisponível!");
            break;
        }

        await scheduleReconnect();
      }
    } else if (connection === "open") {
      // Marca conexão como aberta e atualiza socket global
      setCurrentSocket(socket);
      setConnectionState(true);
      successLog("Fui conectado com sucesso!");
      infoLog("Versão do WhatsApp Web: " + WAWEB_VERSION.join("."));
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
      reconnectAttempts = 0;
      successLog(
        `✅ Estou pronto para uso! 
Verifique o prefixo, digitando a palavra "prefixo" no WhatsApp. 
O prefixo padrão definido no config.js é ${PREFIX}`
      );
      badMacHandler.resetErrorCount();
    } else {
      infoLog("Atualizando conexão...");
    }
  });

  socket.ev.on("creds.update", saveCreds);

  return socket;
}
