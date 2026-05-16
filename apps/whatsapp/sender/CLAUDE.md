# 🤖 Sonar Bot — WhatsApp Sender

Bot de WhatsApp baseado em **Baileys 6.7.20** (Node.js 22+), fork do takeshi-bot.
Arquitetura modular: cada comando é um arquivo — **não existe `switch/case`**.

> 📚 **Documentação completa no vault Obsidian.** Antes de tarefas não triviais,
> consulte:
> - `docs/vault/08-backend/whatsapp-sender-bot.md` — arquitetura, comandos, services, errors
> - `docs/vault/09-infra/pterodactyl-hosting.md` — hospedagem
> - `docs/vault/06-api/message-formatting-core.md` — API de vagas consumida pelo bot

## Fluxo de execução

`index.js` → `src/connection.js` (Baileys, sessão em `assets/auth/baileys/`) →
`src/loader.js` → `src/middlewares/onMessagesUpsert.js` → `src/utils/dynamicCommand.js`
(resolve comando, checa permissão, executa `handle()`).

## Sistema de comandos

Comandos vivem em `src/commands/<perfil>/` — **a pasta define a permissão**:

- `owner/` — só o dono
- `admin/` — administradores de grupo
- `member/` — todos (subpastas `downloads/`, `ia/`, `canvas/`, `funny/`, `search/`, `exemplos/`)

Template:

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

`CommandHandleProps` está tipado em `src/@types/index.d.ts`.

## Regras (OVERRIDE — siga exatamente)

**Sempre:**
- ✅ Ler/escrever database via `src/utils/database.js` (`getPrefix`, `isActiveGroup`, …)
- ✅ Usar as error classes: `InvalidParameterError`, `WarningError`, `DangerError`
- ✅ Consultar `src/@types/index.d.ts` para a API de `CommandHandleProps`
- ✅ Colocar o comando na pasta de permissão correta
- ✅ Fazer cleanup de arquivos temporários (`assets/temp/`)
- ✅ Comentários em português; testar no Node.js 22+

**Nunca:**
- ❌ Ler os JSONs de `database/` direto com `fs`
- ❌ Verificar permissões manualmente (a pasta já faz isso)
- ❌ Editar arquivos core para customizar — use `src/middlewares/customMiddleware.js`
- ❌ Misturar múltiplas responsabilidades num comando

## Configuração

`src/config.js` — `PREFIX`, `BOT_NAME`, `BOT_LID`, `OWNER_LID`, `SPIDER_API_TOKEN`,
`LINKER_API_KEY`, `DEVELOPER_MODE`, proxy opcional. Overrides em runtime via
`database/prefix-groups.json` e `database/config.json`.

## Debugging

- Logs em `assets/temp/wa-logs.txt` (ativar `DEVELOPER_MODE = true` em `src/config.js`)
- Testes: `npm test` (`src/test.js`)
- Erro de conexão / Bad MAC: `bash reset-qr-auth.sh` e reconectar

## Licença

GPL-3.0 — autor original: Guilherme França (Dev Gui). Manter créditos e código aberto.
