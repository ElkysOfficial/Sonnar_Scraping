# Operação — Sonnar

Guia de operação dos serviços do Sonnar via **PM2**. Tudo sobe/para com um comando.

## Serviços

| Processo (PM2) | App | Porta | O que faz |
| --- | --- | --- | --- |
| `sonnar-core` | `packages/message-formatting-core` | 3100 | API HTTP — **único processo que grava o `jobs.json`** + serve as vagas |
| `sonnar-wa-formatter` | `apps/whatsapp/formatter` | 3001 | Gera os cards (imagem) das vagas |
| `sonnar-wa-sender` | `apps/whatsapp/sender` | 3002 | Bot do WhatsApp (Baileys) |
| `sonnar-scraper` | `apps/scraper` | — | Coleta vagas das engines em loop (`while True`) |

Os 4 são processos **de longa duração** — rodam até alguém parar.
O Discord (`apps/discord/*`) **não** está no ecosystem ainda.

Fluxo de dados:
```
scraper ──POST /jobs/batch──▶ core (3100) ──grava──▶ jobs.json
                                   └──serve──▶ formatter (3001) ──▶ sender (3002 / WhatsApp)
```

> **Single-writer:** o `jobs.json` tem **um único escritor — o core**. O scraper
> não grava o arquivo: coleta as vagas e as envia ao core via HTTP. Isso elimina
> a corrida de dois processos gravando o mesmo arquivo (que causava o erro
> `Falha ao gravar jobs.json` e a perda de marcações de envio). Se o core estiver
> fora do ar, o scraper segura as vagas em memória e reenvia quando ele voltar.

## Pré-requisitos

```bash
npm install -g pm2          # uma vez, por máquina
```

Cada app precisa do seu `.env` e dependências instaladas:
- `apps/whatsapp/sender/.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_FUNCTIONS_URL`, `WHATSAPP_LINK_SECRET`
- `apps/scraper/.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORE_API_URL` (opcional — default `http://localhost:3100`)
- `apps/scraper`: `pip install -r requirements.txt`
- Node apps: `npm install` em cada um (já feito)

## Subir

```bash
npm start
# ou: pm2 start ecosystem.config.cjs
```
Sobe os 4 na ordem: core → formatter → sender → scraper.
Se alguns já estiverem rodando, o PM2 sobe só os que faltam.

> **1ª subida do bot:** o `sonnar-wa-sender` pede QR code / código de pareamento.
> Veja com `pm2 logs sonnar-wa-sender` para escanear no WhatsApp.

## Parar

| Comando | O que faz |
| --- | --- |
| `npm stop` | Para os 4 processos (continuam listados no `pm2 status`) |
| `pm2 stop all` | Idem |
| `pm2 stop sonnar-scraper` | Para **um** serviço só |
| `npm run delete` / `pm2 delete all` | Para **e remove** da lista do PM2 |
| `pm2 kill` | Encerra o próprio daemon do PM2 (mata tudo) |

`stop` é reversível com `pm2 start` / `pm2 restart`. `delete` exige `npm start` de novo.

## Comandos do dia a dia

| Comando | O que faz |
| --- | --- |
| `npm run status` / `pm2 status` | Tabela: CPU, RAM, uptime, restarts |
| `npm run logs` / `pm2 logs` | Logs de todos juntos |
| `pm2 logs sonnar-wa-sender` | Logs de um serviço só |
| `npm restart` / `pm2 restart all` | Reinicia todos (use após mudar código) |
| `pm2 restart sonnar-core` | Reinicia um só |
| `pm2 monit` | Painel ao vivo (CPU/RAM por processo) |

## Persistência no boot (VPS)

Depois de subir a primeira vez:
```bash
pm2 save        # grava a lista atual de processos
pm2 startup     # gera o comando p/ o PM2 subir sozinho no boot; rode o comando que ele imprimir
```
Se a VPS reiniciar, os 4 serviços voltam sozinhos.

---

## Memória — máquina de 4GB

A máquina tem **4GB de RAM**. O ecosystem tem `max_memory_restart` por processo:
**se um processo passar do teto, o PM2 reinicia só ele** — evita travar a máquina inteira (OOM).

### Orçamento

| Processo | Teto (`max_memory_restart`) | Observação |
| --- | --- | --- |
| `sonnar-core` | 512 MB | Faz `JSON.parse` do `jobs.json` inteiro (~18k vagas) por request; 250M reiniciava a cada ciclo VIP |
| `sonnar-wa-formatter` | 400 MB | Canvas (geração de imagem) tem picos |
| `sonnar-wa-sender` | 500 MB | Baileys cresce com o tempo (reinício limpa) |
| `sonnar-scraper` | 1024 MB | Mais pesado — coleta + parsing |
| **Total apps** | **~2,4 GB** | Sobra ~1 GB pro SO + ~0,6 GB de folga |

### Regras para não estourar / não dar gargalo

1. **Não rode tudo + ferramentas pesadas juntas.** Numa VPS de 4GB, evite manter navegador/IDE abertos junto dos serviços.
2. **Acompanhe o uso real:**
   ```bash
   pm2 status          # coluna "mem" por processo
   free -m             # memória total da máquina (Linux)
   ```
   Se "free" cair perto de 0 e o "swap" subir → está no limite.
3. **Reinícios frequentes por memória** (`pm2 status` mostra o contador `↺` subindo):
   - **Scraper** estourando 1GB → o problema é concorrência da coleta, não o teto.
     Reduza o paralelismo no scraper (`BATCH_INTERVAL_SECONDS` / nº de engines por lote)
     em vez de só aumentar o limite.
   - **Sender** estourando 500MB → normal o Baileys vazar com o tempo; o restart limpa.
     Se reiniciar muito rápido, suba o teto para 600M.
4. **Atenção a navegadores no scraper:** se alguma engine usa Playwright/Selenium,
   os processos do Chromium são **filhos** do scraper e o `max_memory_restart` do PM2
   mede só o processo pai (Python). O Chromium pode consumir RAM **fora** desse teto.
   Mitigação: rodar headless, fechar o browser entre lotes (o código já faz `close_browser()`),
   e limitar quantas engines com browser rodam em paralelo.
5. **Swap como rede de segurança** (Linux/VPS) — crie ~2GB de swap para a máquina não
   travar em picos. Não é pra uso contínuo (swap é lento = gargalo), só amortece:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
6. **Se faltar RAM de verdade:** o serviço mais sacrificável é o `sonnar-scraper`.
   Dá pra pará-lo (`pm2 stop sonnar-scraper`) e rodar a coleta em horários de menor uso,
   mantendo só core + formatter + sender no ar (esses somam ~1,15 GB).

### Ajustar um teto

Edite `max_memory_restart` no `ecosystem.config.cjs` e aplique:
```bash
pm2 restart ecosystem.config.cjs --update-env
```

---

## Troubleshooting

| Sintoma | Onde olhar |
| --- | --- |
| Bot não conecta no WhatsApp | `pm2 logs sonnar-wa-sender` — procure QR/código de pareamento |
| Vagas não chegam | `sonnar-core` no ar? `pm2 logs sonnar-core`. `jobs.json` tem dados? |
| Cards não geram | `sonnar-wa-formatter` no ar? Porta 3001 |
| `↺` (restarts) subindo | Processo crashando ou estourando RAM — veja os logs dele |
| Coleta parada | `pm2 logs sonnar-scraper` |

Logs do PM2 ficam em `~/.pm2/logs/`. Para limpar: `pm2 flush`.
