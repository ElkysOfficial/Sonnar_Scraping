---
title: Bot WhatsApp Sender (Sonar Bot)
tags: [backend, whatsapp, bot, baileys]
updated: 2026-05-16
---

# Bot WhatsApp Sender (Sonar Bot)

App `apps/whatsapp/sender` — bot de WhatsApp baseado em **Baileys 6.7.20**
(fork do takeshi-bot, Dev Gui), Node.js 22+. Arquitetura modular: cada comando
é um arquivo, sem `switch/case` gigante. Distribui vagas e oferece comandos
utilitários nos grupos. Consome a API em [[../06-api/message-formatting-core]].

## Fluxo de execução

`index.js` (= `src/index.js`) → `src/connection.js` (conecta via Baileys, QR/pareamento,
sessão em `assets/auth/baileys/`) → `src/loader.js` (registra listeners, timeout
anti-ban) → `src/middlewares/onMessagesUpsert.js` (filtra, detecta comando) →
`src/utils/dynamicCommand.js` (resolve comando, checa permissão, executa `handle()`).

## Sistema de comandos por pasta

Comandos vivem em `src/commands/<perfil>/` — a **pasta define a permissão**, o dev
não verifica permissão manualmente:

- `owner/` — só o dono (exec, on/off, set-prefix, set-spider-api-token, get-group-id)
- `admin/` — administradores (ban, mute, anti-*, welcome, auto-responder)
- `member/` — todos; subpastas `downloads/`, `ia/`, `canvas/`, `funny/`, `search/`, `exemplos/`

Template de comando:

```javascript
import { PREFIX } from "../../config.js";
import { InvalidParameterError } from "../../errors/index.js";

export default {
  name: "meu-comando",
  description: "Faz algo",
  commands: ["meu-comando", "mc"],
  usage: `${PREFIX}meu-comando <arg>`,
  /** @param {CommandHandleProps} props */
  handle: async ({ sendReply, args, sendSuccessReact }) => {
    if (!args.length) throw new InvalidParameterError("Argumento obrigatório!");
    await sendSuccessReact();
    await sendReply("ok");
  },
};
```

`CommandHandleProps` está tipado em `src/@types/index.d.ts` — args, detectores
(`isImage`/`isVideo`/...), 26 funções `send*`, `download*`, `getGroup*`, `socket`.

## Database JSON

`database/*.json` — nunca ler com `fs` direto, sempre via `src/utils/database.js`
(`getPrefix`, `isActiveGroup`, `muteMember`, `getAutoResponderResponse`, etc).
Arquivos: `config.json`, `prefix-groups.json`, `inactive-groups.json`, `muted.json`,
`only-admins.json`, `auto-responder*.json`, `anti-link-groups.json`, etc.

## Configuração — `src/config.js`

`PREFIX`, `BOT_NAME`, `BOT_EMOJI`, `BOT_LID`, `OWNER_LID`, `ONLY_GROUP_ID`,
`DEVELOPER_MODE`, `TIMEOUT_IN_MILLISECONDS_BY_EVENT` (700ms anti-ban),
`SPIDER_API_TOKEN`/`SPIDER_API_BASE_URL`, `LINKER_API_KEY`, proxy opcional.
Overrides em runtime via `prefix-groups.json` / `config.json`.

## customMiddleware

`src/middlewares/customMiddleware.js` — ponto de injeção para customizações sem
tocar no core (sobrevive a updates do bot). Hooks `type: "message"` (com
`commonFunctions`) e `type: "participant"` (`action` add/remove, `commonFunctions`
null). Sempre validar `type` e `commonFunctions` antes de usar.

## Errors

`src/errors/` — `InvalidParameterError` (param inválido), `WarningError` (aviso
amarelo), `DangerError` (erro crítico/permissão). `dynamicCommand.js` trata cada
um com cor de resposta diferente.

## Services

`src/services/` — `spider-x-api.js` (downloads, Gemini, GPT-5, Flux, ATTP/TTP),
`ffmpeg.js` (filtros de imagem/áudio), `sticker.js` (WebP 512x512), `baileys.js`
(foto de perfil), `upload.js` (FreeImage.Host), `whatsappLinker.js` (vinculação
do LID do assinante — ver fluxo de pareamento do portal).

## Bad MAC / reconexão

`src/utils/badMacHandler.js` — até 15 tentativas, auto-clear da sessão
problemática. Reset manual: `bash reset-qr-auth.sh` (apaga `assets/auth/baileys`).

## Hospedagem

Roda em Pterodactyl — ver [[../09-infra/pterodactyl-hosting]].

## Referências

- Código: `apps/whatsapp/sender/src/`
- Tipos: `apps/whatsapp/sender/src/@types/index.d.ts`
- Logs: `assets/temp/wa-logs.txt` (ativar `DEVELOPER_MODE = true`)
- API consumida: [[../06-api/message-formatting-core]]
- Fonte upstream: takeshi-bot (Dev Gui), licença GPL-3.0
