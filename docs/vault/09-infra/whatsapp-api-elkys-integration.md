---
title: Integração WhatsApp API ↔ Site Elkys
tags: [infra, api, whatsapp, elkys, supabase, vps, integracao]
updated: 2026-05-19
status: implementado-no-codigo / pendente-deploy
---

# Integração WhatsApp API ↔ Site Elkys

Permite que o site da Elkys dispare mensagens de WhatsApp através do
[[../08-backend/whatsapp-sender-bot]]. Objetivo: **quando o site envia um
e-mail, mandar também por WhatsApp**.

> **Estado atual (2026-05-19):** código pronto e commitado localmente.
> Falta executar os passos de deploy na VPS e no Supabase (ver checklist no fim).

## Arquitetura

```
Site Elkys (React SPA, estático)
        │  (não chama o bot direto — frontend não guarda segredo)
        ▼
Supabase Edge Function (Deno, server-side)  ── guarda o token ──┐
        │                                                       │
        ▼  POST http://82.25.68.106:3002/send                   │
   Bot WhatsApp na VPS (apiReceiver.js, porta 3002)  ◄───────────┘
        │  Authorization: Bearer <WHATSAPP_API_TOKEN>
        ▼
   socket.sendMessage() → WhatsApp do número conectado
```

Por que a Edge Function no meio: o site é um SPA estático (build em `dist/`,
hospedado por FTP na Hostinger). Qualquer token no JS do frontend ficaria
visível no navegador. A Edge Function roda no servidor — é o lugar seguro
para o segredo e para o `fetch`.

## Dados de conexão

- **VPS:** Hostinger, IP `82.25.68.106`
- **Porta da API do bot:** `3002`
- **URL correta do endpoint:** `http://82.25.68.106:3002/send`
  (IP e porta separados por **um** `:` — não usar `/3002` no caminho)
- **Site Elkys:** repo `ElkysOfficial/Elkys_Official_WebSite`
  (React 18 + Vite + Supabase, 12 Edge Functions Deno)

## O que foi implementado no código (bot)

Autenticação por token Bearer no API Receiver. Commits locais no repo
`Sonnar_Scraping`:

| Arquivo | Mudança |
|---------|---------|
| `apps/whatsapp/sender/src/services/apiReceiver.js` | Middleware `requireAuth` em `/send` e `/send-batch`; `safeEqual` (comparação em tempo constante, anti-timing-attack) |
| `apps/whatsapp/sender/src/config.js` | Nova const `WHATSAPP_API_TOKEN` |
| `apps/whatsapp/sender/.env.example` | Documentada a variável `WHATSAPP_API_TOKEN` |
| `setup-vps.sh` (raiz) | Script de bootstrap da VPS (instala deps + sobe PM2) |

Comportamento:
- `/send` e `/send-batch` → exigem header `Authorization: Bearer <token>`.
- Token vazio no `.env` → API responde **503** e recusa tudo (fail-safe:
  não expõe a porta sem proteção).
- Token errado/ausente → **401 Unauthorized**.
- `/health` e `/status` → continuam **abertos** (monitoramento).

## API do bot — referência

`POST /send` — envia 1 mensagem.

```jsonc
// Headers
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <WHATSAPP_API_TOKEN>"
}
// Body
{
  "to": "5511999999999@s.whatsapp.net",  // DDI+DDD+numero
  "text": "qualquer texto, multilinha e emoji ok",
  "image": {                              // opcional
    "mimeType": "image/jpeg",
    "base64": "..."
  }
}
```

- **`to`:** usar JID de número `5511999999999@s.whatsapp.net` (DDI+DDD+número).
  **Não usar o lid** — é identificador interno do WhatsApp, não serve para
  envio externo. Grupo seria `id@g.us`.
- **`text`:** aceita qualquer string — pode reaproveitar o mesmo conteúdo
  do e-mail.
- Resposta: `{ "success": true }` ou erro `400/401/500/503`.

`POST /send-batch` — `{ messages: [...], delay?: 2000 }` para vários envios.

## Lado do site Elkys — módulo compartilhado

Não editar as 12 Edge Functions uma a uma. Criar **um módulo compartilhado**
e cada função de e-mail chama ele depois de enviar o e-mail.

```ts
// supabase/functions/_shared/whatsapp.ts
export async function sendWhatsApp(to: string, text: string) {
  const res = await fetch("http://82.25.68.106:3002/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("WHATSAPP_API_TOKEN")}`,
    },
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) console.error("WhatsApp falhou:", await res.text());
  return res.ok;
}
```

```ts
// dentro de cada Edge Function que dispara e-mail:
import { sendWhatsApp } from "../_shared/whatsapp.ts";
// ... após enviar o e-mail:
await sendWhatsApp("5511999999999@s.whatsapp.net", "Mesmo texto do e-mail");
```

## setup-vps.sh — bootstrap da VPS

Script na raiz do repo. Instala dependências dos 4 apps e sobe o PM2 num
comando só:

```bash
bash setup-vps.sh            # instala deps + pm2 start (padrão)
bash setup-vps.sh --deps     # só instala dependências
bash setup-vps.sh --start    # só sobe o PM2
```

Primeira vez na VPS:
```bash
git clone <repo> sonnar && cd sonnar
bash setup-vps.sh
pm2 startup        # copiar/colar o comando que ele imprime (persistir no boot)
```
Deploys seguintes: `cd sonnar && git pull && bash setup-vps.sh`

Pré-requisitos na VPS (uma vez): Node.js 22+, Python 3, `python3-venv`.
PM2 o script instala sozinho se faltar.

## ✅ Checklist de deploy (PENDENTE — fazer quando tiver acesso à VPS)

1. [ ] **Gerar o token** numa máquina qualquer: `openssl rand -hex 32`
2. [ ] Na VPS, pôr o token no `.env` do bot
       (`apps/whatsapp/sender/.env`): `WHATSAPP_API_TOKEN=<token>`
3. [ ] Liberar a porta no firewall da VPS: `ufw allow 3002`
       (e checar se o painel da Hostinger também não bloqueia)
4. [ ] Reiniciar o bot: `pm2 restart sonnar-wa-sender`
       (no log deve aparecer `🔒 Auth: Bearer token (ativo)`)
5. [ ] No **Supabase do site Elkys**, criar o secret com o **mesmo token**:
       `WHATSAPP_API_TOKEN` (Edge Functions secrets)
6. [ ] Criar `supabase/functions/_shared/whatsapp.ts` no repo do site
7. [ ] Importar `sendWhatsApp` nas Edge Functions que disparam e-mail
8. [ ] Fazer deploy das Edge Functions
9. [ ] Testar: `GET http://82.25.68.106:3002/status` deve dar `connected`;
       depois um `POST /send` de teste com o token

## ⚠️ Pendências de segurança (melhorar depois)

- A chamada é `http://` puro — o **token trafega sem criptografia**.
  Token + firewall já é um salto enorme vs. hoje (porta sem nenhuma auth),
  mas o ideal futuro é **nginx com HTTPS** na frente da 3002, ou um
  **Cloudflare Tunnel**.
- As Edge Functions do Supabase não têm IP fixo, então não dá para
  restringir o firewall por IP de origem — daí a importância do token.

## Relacionado

- [[../08-backend/whatsapp-sender-bot]] — arquitetura do bot
- [[pterodactyl-hosting]] — hospedagem (nota: agora VPS Hostinger + PM2)
- [[../06-api/message-formatting-core]] — API de vagas
