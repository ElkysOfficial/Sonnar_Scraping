# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [3.8.1] - 2026-05-29

### Adicionado — Plus #5: Match breakdown estruturado (zero LLM)

Continuação direta do Plus #4 — agora o currículo parseado é consumido
pelo sender pra gerar um bloco comparativo em cada vaga enviada na DM
privada do assinante Plus.

**Exemplo de mensagem (Plus que subiu currículo):**

```
*Senior Backend Engineer*
🏢 _Acme_
📍 SP
💼 Remoto
💰 *R$ 15.000*

*🧩 Tecnologias*
✓ Node.js  ·  ✓ AWS  ·  ✗ Go  ·  ✓ TypeScript

📊 *Match:* 3 de 4 skills (75%)

*🎯 Comparado com seu curriculo*
✓ Curriculo bate em 3 de 4 skills da vaga
✓ Vaga pede 5+ anos — seu curriculo indica ~7 anos
✓ Seu nivel (senior) bate com a vaga (senior)

*📋 Responsabilidades*
• ...
```

**Mudanças técnicas:**

- **`apps/whatsapp/sender/src/services/jobRequirementsParser.js`** (novo):
  - `extractRequiredYears(description)` — regex pra `5+ anos`, `pelo menos
    3 anos`, `experiência de 5 anos`, etc.
  - `extractRequiredSeniority(title, description)` — heurística por
    keyword (lead/staff > senior > pleno > junior).
  - `compareSeniority(candidate, required)` — `"match" | "under" | "over"`.
  - `extractJobRequirements(job)` — agregador.
- **`textBuilder.js`** — `formatJobMessage` ganha 4º campo em `options`:
  `subscriberResume`. Quando presente, chama nova função
  `appendResumeBreakdown` que monta 3 linhas:
  - Skills do currículo que batem com as da vaga (`✓ N de M`)
  - Anos exigidos vs anos do CV (`✓` ou `⚠ com gap`)
  - Senioridade do CV vs da vaga (`✓`, `⚠ under` ou `✓ over`)
- **`utils/database.js#getPortalPlusSubscribers`**: agora faz 1 query
  extra (em batch, 1 round-trip pra todos Plus) lendo `subscriber_resumes`
  ativos e anexa `resume` ao objeto do subscriber.
- **`vipJobSender.js`**: `sendJobToSubscriber(lid, job, subscriberStack,
  subscriberResume)` propaga o resume nos 3 callsites internos
  (`processVipJobs`, `forceVipJobCheck`, `triggerVipSearch`).

**Banco:** zero mudanças — usa `subscriber_resumes` criada na v3.8.0.

**VPS:** custo desprezível — 1 query extra (batched) por ciclo VIP +
parsing regex local (sub-millisegundo por vaga).

**Custo runtime:** **zero**. Sem LLM. Determinístico.

**Diferenciação Plus:** o bloco só aparece quando o assinante:
1. Tem `plan='plus'` (já é Plus pra cair no DM privado)
2. Subiu currículo no Plus #4 (`subscriber_resumes` com `is_active=true,
   parse_status='done'`)

Plus que ainda não subiu CV recebe apenas o Plus #1 (✓/✗ stacks).

### Testes

- **10 testes novos** (72 total no sender, todos verdes):
  - Bloco aparece/desaparece com base em `subscriberResume`
  - Cobertura de skills do CV bate/não bate
  - Anos: `✓` quando atinge, `⚠ com gap` quando falta
  - Senioridade: 3 casos (`match`, `under`, `over`)
  - Resume sem dados relevantes não polui mensagem (omite bloco)

## [3.8.0] - 2026-05-29

### Adicionado — Plus #4: Upload de currículo + parse determinístico (zero LLM)

Segunda funcionalidade flagship do plano Plus. Cliente faz upload de
PDF/DOCX no dashboard, sistema extrai automaticamente skills, anos de
experiência, senioridade e idiomas — **sem nenhum LLM pago, sem custos
recorrentes**. Todo o pipeline roda em Supabase Edge + Storage.

**Arquitetura (Caminho A — Zero Custo):**

```
Frontend (Vue)                Supabase Storage      Supabase Edge Function
   │                               │                         │
   │  1. select PDF/DOCX           │                         │
   │─────►uploads─────────────────►│                         │
   │       resumes/<sub_id>/<uuid> │                         │
   │                               │                         │
   │  2. invoke parse-resume       │                         │
   │──────────────────────────────────────────────────────►  │
   │                               │                         │ baixa arquivo
   │                               │◄────────download────────│
   │                               │                         │ pdfjs / mammoth
   │                               │                         │ -> texto
   │                               │                         │ regex vocab
   │                               │                         │ -> skills, anos,
   │                               │                         │    seniority, idiomas
   │                               │                         │ INSERT subscriber_resumes
   │                               │                         │
   │◄──────────── { skills, yearsTotal, seniority, ... } ────│
   │                                                          
   │  3. UI mostra resultado
```

**Componentes:**

- **`supabase/migrations/20260529150000_subscriber_resumes.sql`**:
  - Tabela `subscriber_resumes` (file_path, raw_text, extracted_skills,
    years_total, seniority, languages, parse_status, parser_version)
  - Trigger garante 1 currículo `is_active=true` por subscriber
  - RLS: cada subscriber só vê/edita os próprios
  - Storage bucket `resumes` privado (10MB max, só PDF/DOCX)
  - Storage policies: subscriber só pode upload na própria pasta
  - RPC `get_my_active_resume()` retorna o currículo ativo
- **`supabase/functions/_shared/skills_vocabulary.ts`**: vocabulário
  canônico de 1118 skills/papéis, gerado a partir do
  `apps/scraper/src/utils/skills_vocabulary.py`. Sincronia manual quando
  o Python evolui.
- **`supabase/functions/_shared/resumeParser.ts`**: parser determinístico:
  - `extractSkills`: regex case-insensitive contra o vocabulário,
    com lookarounds que aceitam fronteiras não-alfanuméricas (cobre
    `Node.js`, `C#`, `.NET`).
  - `extractYearsTotal`: soma intervalos `AAAA - AAAA` (mergeando
    sobrepostos pra não contar 2× o mesmo período). Fallback: `X anos`.
  - `extractSeniority`: ranking lead/staff > senior > pleno > junior
    por keyword.
  - `extractLanguages`: regex contra dicionário PT/EN/ES/FR/DE/IT/JA/ZH.
- **`supabase/functions/parse-resume/index.ts`**: Edge Function que
  recebe `{ subscriberId, filePath, fileMime }`, valida que o subscriber
  pertence ao usuário autenticado E que o plano é Plus, baixa arquivo do
  Storage, extrai texto via `pdfjs-dist` (PDF) ou `mammoth` (DOCX), roda
  o parser, persiste em `subscriber_resumes` (insert pending → update
  done/failed). Custo: zero LLM, apenas CPU do Edge Function.
- **`apps/web/src/components/ResumeUpload.vue`**: componente Vue 3
  (TypeScript) que faz o upload direto pro Storage, chama a Edge
  Function, exibe o resultado (skills detectadas como chips, anos,
  senioridade, idiomas). UI mostra currículo ativo + permite substituir.

**Banco:** +1 tabela `subscriber_resumes` + 1 trigger + 1 RPC + 1 bucket
+ 3 policies. Tabelas existentes intocadas.

**VPS:** zero — todo o pipeline roda em Supabase Edge + Storage.

**Custo runtime:** **zero**. Pdfjs + mammoth são MIT/free. Sem LLM. Sem
APIs pagas. Escala infinita.

**Diferenciação Plus:**

- Edge Function rejeita (HTTP 402) chamadas de subscribers com `plan !== 'plus'`.
- Frontend deve esconder a tab "Currículo" para Free/Pro (integração ao
  `DashboardSettings.vue` fica como follow-up — neste PR a feature está
  funcional via componente standalone).

### Próximo passo no roadmap

Plus #5 (Match breakdown estruturado) consumirá os campos
`extracted_skills` desta tabela pra gerar comparações ✓/✗/⚠ entre
currículo e descrição da vaga — ainda sem LLM, usando set intersection
+ checagem de anos contra os requisitos mencionados.

## [3.7.1] - 2026-05-29

### Adicionado — Upsell automático Free → Plus (email + WhatsApp semanal)

Pipeline de conversão automática rodando 100% fora da VPS:

- **`supabase/functions/weekly-upsell-free-to-plus/index.ts`** — Edge
  Function nova. Disparada por `pg_cron` toda segunda 10:00 BRT. Para
  cada subscriber elegível (Free + ativo + 7+ dias de cadastro + sem
  upsell recente do canal), monta pitch personalizado com estatística
  real da semana ("Esta semana publicamos N vagas — apenas M apareceram
  no grupo, as outras X foram pra DM dos Plus") + 3 exemplos reais +
  CTA pro checkout Plus.
- **`supabase/migrations/20260529120000_upsell_log_free_to_plus.sql`** —
  Tabela `upsell_log` (rate-limit + auditoria) + RPC
  `list_upsell_free_candidates(channel)` que filtra elegíveis com
  rate-limit de **1 envio por canal a cada 30 dias** (evita assédio).
  RLS limpo (só admins veem o log) + instruções pro agendamento cron.
- **Email via Resend** (já integrado via `send-auth-email`), HTML
  reaproveitando `_shared/emailTemplate.ts`.
- **WhatsApp via `POST /send` do sender** (endpoint já existente,
  autenticado por `WHATSAPP_API_TOKEN`).

**Configuração pós-deploy** (uma vez):

1. `supabase db push` aplica a migration.
2. Secrets na Edge Function:
   - `RESEND_API_KEY` (já existe)
   - `SENDER_API_URL` (ex: `https://api.sonnarjobs.com.br`)
   - `SENDER_API_TOKEN` (mesmo valor de `WHATSAPP_API_TOKEN` no sender)
   - `CRON_TOKEN` (gerar segredo, usar no cron abaixo)
3. Postgres settings:
   ```sql
   alter database postgres set app.functions_url = 'https://<ref>.functions.supabase.co';
   alter database postgres set app.upsell_cron_token = '<CRON_TOKEN>';
   ```
4. Agendar cron:
   ```sql
   select cron.schedule('weekly-upsell-free-to-plus', '0 13 * * 1', $$
     select net.http_post(
       url := current_setting('app.functions_url') || '/weekly-upsell-free-to-plus',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.upsell_cron_token'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     );
   $$);
   ```

**Banco:** +1 tabela `upsell_log` + 1 RPC. Tabelas existentes intocadas.

**VPS:** zero — toda a lógica de seleção e envio roda em Supabase Edge +
Resend. O bot Baileys apenas recebe `POST /send` (endpoint pré-existente).

**Custo runtime:** Resend free tier (3.000 emails/mês) cobre folgado.
Edge Function: 1×/semana = 4/mês.

### Diferenciação por plano

Funcionalidade do **Free** (target da campanha) que serve ao funil do
**Plus** (objetivo de conversão). Não envia para Pro nem Plus.

## [3.7.0] - 2026-05-29

### Adicionado — Plus #1: ✓/✗ stacks compatíveis no WhatsApp

Primeira funcionalidade do roadmap de diferenciação do Plus.

Quando uma vaga é enviada na DM privada do assinante Plus, agora cada skill
da vaga aparece marcada conforme o stack declarado no perfil:

```
*🧩 Tecnologias*
✓ Node.js  ·  ✓ AWS  ·  ✗ Go  ·  ✓ TypeScript

📊 *Match:* 3 de 4 skills (75%)
```

Antes o cliente via só uma lista de tecnologias sem contexto. Agora ele
sabe imediatamente quantas skills da vaga ele já tem e quais faltam —
informação acionável que torna o match score `0–100` (já existente desde
v3.0.0) **explicável**.

**Mudanças técnicas:**

- `apps/whatsapp/sender/src/services/textBuilder.js`: `formatJobMessage`
  ganha 3º parâmetro `options.subscriberStack`. Quando presente, monta
  o bloco de skills com marcadores ✓/✗ e adiciona linha de sumário com
  porcentagem. Comparação case-insensitive. Sem `subscriberStack` ou
  array vazio = comportamento legado (skills separadas por `•`).
- `apps/whatsapp/sender/src/services/vipJobSender.js`:
  - `buildJobTextMessage(job, options, deps)` ganha `options.subscriberStack`.
  - `sendJobToSubscriber(lid, job, subscriberStack=[])` propaga o stack.
  - 3 callsites internos passam `subscriber.stacks || []` (objeto já
    carregado do `getVipSubscribers()`, vem do `subscriber_profiles.stack[]`).

**Banco:** nenhuma mudança — `subscriber_profiles.stack[]` já existia desde
v3.0.0. RPC `get_my_vip_jobs` inalterado.

**VPS:** custo desprezível (Set intersection de ~5×5 strings por mensagem).

**Diferenciação:** funcionalidade exclusiva do Plus. Grupo público (Free) e
grupo Pro continuam sem marcação (textBuilder chamado sem
`subscriberStack`).

### Testes

- **14 testes novos** (62 total no sender, todos verdes):
  - 8 em `textBuilder.test.js` cobrindo formatJobMessage com diferentes
    inputs de `subscriberStack` (match 0/50/100%, case-insensitive,
    fluxo legado, skills vazias).
  - 6 em `vipJobSender.test.js` cobrindo o pipeline `buildJobTextMessage`
    com a opção nova + integração até o socket.

## [3.6.1] - 2026-05-29

### Adicionado

- **`apps/web/public/ads.txt`** com o publisher ID do AdSense
  (`pub-7896888594916293`). Obrigatório pelo IAB Tech Lab — sem ele o
  painel do Google AdSense mostra warning de conformidade e o site perde
  elegibilidade a Authorized Buyers. Servido em
  `https://sonnarjobs.com.br/ads.txt` pelo build do Vite (regra
  `DOCUMENT_ROOT -f` no `.htaccess` existente serve assets diretos).
- **Meta tag `<meta name="google-adsense-account">`** no `index.html` com
  o publisher ID. Boa prática oficial do AdSense — ajuda na validação de
  propriedade do site e não depende do loader async carregar antes do
  crawler do Google ler a página.
- **Crawlers do AdSense explícitos no `robots.txt`**:
  `Mediapartners-Google`, `AdsBot-Google` e `AdsBot-Google-Mobile` com
  `Allow: /`. Evita ambiguidade — o `User-agent: *` já permitia, mas
  declarar especificamente cumpre recomendação oficial.
- **Sitemap.xml expandido** com `/cadastro`, `/termos`, `/privacidade`,
  `/cookies`. Antes só listava `/` e `/signup` (rota antiga). Atualiza
  `lastmod` pra 2026-05-29. Sitemap completo facilita a indexação
  semântica que o AdSense usa pra escolher anúncios relevantes.

### Configuração confirmada (já estava OK desde v3.6.0)

- HTTPS via Hostinger SSL ✓
- Política de Privacidade em `/privacidade` ✓
- Termos de Uso em `/termos` ✓
- Banner de cookies com `__tcfapi` (TCF v2.4) ✓
- CSP permite googlesyndication / doubleclick / googleadservices ✓
- `lang="pt-BR"` no `<html>` ✓
- Meta description + Open Graph + Twitter Card ✓
- Componente `<AdSlot>` configurado com publisher + slot ✓

## [3.6.0] - 2026-05-29

### Mudado

- **Vagas passam a ser enviadas em texto puro no WhatsApp.** A geração de
  imagem (cards 1080×1080) foi **descontinuada** do produto. Toda a
  informação que vivia no card visual (salário em destaque, modalidade,
  fonte, data) agora aparece no próprio texto da mensagem, junto com o que
  já estava na caption (título, empresa, localização, skills,
  responsabilidades, link encurtado).

### Adicionado

- **`apps/whatsapp/sender/src/services/textBuilder.js`**: monta a mensagem
  completa em texto. Porta de `extractJobDataFromEmbed` + caption +
  `extractResponsibilities` do formatter antigo, com layout novo incluindo
  salário e source/data no rodapé.
- **`apps/whatsapp/sender/src/services/coreClient.js`**: sender fala direto
  com `message-formatting-core` (eliminado o middleman do formatter pro
  `cardJobSender`).

### Removido

- **Processo `sonnar-wa-formatter`** do `ecosystem.config.cjs` (-1 PM2,
  -600MB de teto de RAM). PM2 cai de 4 para 3 processos ativos.
- **`apps/whatsapp/formatter/`** inteiro deletado do repo.
- Dependência `@napi-rs/canvas` sai do disco da VPS.
- Variável `CARD_API_URL` removida do `config.js` do sender.

### Revertido

- **PR #100 (v3.5.0)** e **PR #101 (v3.5.1)** — tentativa de migrar canvas
  pra Vercel Edge Function via `@vercel/og`. Substituído por essa solução
  mais direta (texto puro, zero vendor novo, zero DNS, zero compute extra).

### Performance

Primeiro PR efetivo do roteiro de redução de carga da VPS (ADR-006).
Métrica real pós-deploy a ser registrada em
`docs/vault/13-issues/vps-cpu-peak-reduction.md`.

**Pacote de 16 alavancas adicionais aplicadas neste PR** (estimativa
agregada: vCPU pico **73% → ~50-55%**, RAM **-700MB** transitório):

- **Scraper:**
  - `CAREERJET_COUNTRY_BATCH_SIZE` default 10 → **2** (menos modelos Argos
    paralelos; -8 pp vCPU pico).
  - `LINKEDIN_DETAIL_CONCURRENCY` default 4 → **3** (-5 pp em ciclos
    LinkedIn-pesados).
  - `browser_fetch` timeout 30s → **20s** (libera memória do browser
    antes em páginas travadas).
  - `--disable-images --disable-css/font/media` no Chromium do
    `browser_fetch` via `context.route` + flag `imagesEnabled=false`
    (-30 a -50% CPU do Chromium por página).
  - Argos warmup: 27 → **8 idiomas** (-800MB no boot).
  - `lru_cache(1024)` em `extract_skills` (cache de regex por
    descrição).
  - Cron de restart 2×/dia documentado (4h + 16h) no
    `ecosystem.config.cjs`.

- **Sender:**
  - `max_memory_restart` 500M → **400M** (sem buffer de imagem).
  - `--max-old-space-size=384` no `node_args` do PM2 (GC mais previsível).
  - `NODE_ENV=production` explícito.
  - Baileys logger em `silent` em prod (corta CPU de formatação pino +
    I/O de disco em horários de pico).
  - HTTP keep-alive nos clients axios (`coreClient`) — reusa conexão
    TCP entre requests; -CPU de handshake.
  - `msgRetryCounterCache` com `stdTTL: 3600` + `checkperiod: 600`
    (eliminado leak de entries que cresciam indefinidamente).
  - Removida dep obsoleta `@cacheable/node-cache` (0 uses).

- **Core:**
  - Gzip nas respostas Express via `compression({ threshold: 1024 })` —
    `/jobs/pending` reduz ~70% bandwidth/RAM transit.
  - SQLite já estava em `WAL` + `synchronous=NORMAL` (no-op,
    confirmação).

### Testes

- **48 testes** novos cobrindo o pipeline texto-only:
  - `textBuilder.test.js` (19) — montagem da mensagem, extractor,
    fallbacks, edge cases.
  - `textBuilder.integration.test.js` (10) — 12 vagas reais (fixture)
    rendendo mensagens completas + invariantes.
  - `cardJobSender.test.js` (9) — `buildNextJobMessage`,
    `sendJobMessage`, `processNextCard` com DI (socket/db/core mockados).
  - `vipJobSender.test.js` (10) — `buildJobTextMessage`,
    `sendJobMessage` com socket mockado.
- **Smoke test:**
  `apps/whatsapp/sender/scripts/dry-run-text-delivery.js` — roda fixture
  e imprime cada mensagem renderizada (modo offline) ou consulta o core
  e renderiza vagas reais (modo `--live`).

### Qualidade — pipeline PT-only obrigatório

- **Backfill removido completamente**: `apps/scraper/scripts/backfill_enrichment.py`
  deletado. Não existe mais o conceito de "vaga legado sem enrichment" — toda
  vaga nova já passa por `enrich_canonical` na engine.
- **Guarda no core**: `POST /jobs/batch` agora **rejeita** (HTTP 422) qualquer
  payload com vaga que não tenha `description_lang` preenchido. Esse campo só
  existe se a engine chamou o pipeline de enrichment — a guarda previne que
  uma engine quebrada deixe texto estrangeiro vazar pro banco.
- **Engines: `try/except: pass` substituído por skip + log warning** em 17
  arquivos (15 engines do padrão simples + linkedin + careerjet). Se o
  Argos crashar ao traduzir uma vaga, a vaga é descartada localmente em vez
  de gravada com texto estrangeiro. O log do scraper mostra qual vaga foi
  pulada e por quê (mensagem `[engine] skip job=... enrichment falhou: ...`).
- **Removido `hint_lang="pt"` das 10 engines BR** (indeed, gupy, bne, catho,
  geekhunter, infojobs, jooble, michaelpage, programathor, simplyhired).
  O hint forçava o pipeline a pular detecção de idioma — vagas em inglês
  postadas em sites brasileiros (multinacionais no Indeed, GeekHunter, etc)
  iam pro banco como se fossem PT. Agora `detect_lang` roda em toda vaga;
  custo de CPU é desprezível (regex única, otimizada em v3.4.0). Careerjet
  mantém `hint_lang="pt"` legitimamente — traduz inline antes do enrich,
  então o hint pula tradução dupla.
- **Efeito final**: o banco `jobs.db` e tudo que vai pro cliente/grupo é
  garantidamente em **português** (description traduzida via Argos quando
  origem != pt; `description_lang` preserva o idioma original para auditoria).

### Operação

- VPS: nenhuma config nova de env. `pm2 reload ecosystem.config.cjs` +
  `pm2 delete sonnar-wa-formatter` + `pm2 save`.
- Se você tinha configurado Vercel/DNS para o card-renderer dos PRs
  #100/#101: pode deletar o projeto Vercel e remover o CNAME
  `cards.sonnarjobs.com.br` no painel Hostinger.
- Monitorar nos logs `[<engine>] skip job=...` após deploy — se aparecer em
  volume alto numa engine específica, sinal de problema sistêmico no Argos
  (sem modelo baixado, OOM, etc).

## [3.2.0] - 2026-05-25

### Adicionado

- **Checkpoint persistente do ciclo no scraper**: o controller agora salva o
  `batch_idx` em execução no Supabase (`scraper_progress` com chave fixa
  `engine=_controller`, `batch_key=cycle`). Após PM2 restart, o scraper
  retoma do mesmo lote onde parou — antes reiniciava sempre do lote 1/N,
  perdendo posição. Métodos novos: `progress.save_cycle_idx`,
  `load_cycle_idx`, `clear_cycle_idx`. Se a lista de stacks mudou entre
  deploys (total diferente), reinicia do 1 com segurança.

### Performance

5 otimizações de CPU no scraper, reduzindo pico estimado de 73% para ~40-50%
e sustentado para ~25-35%:

- **`section_extractor`**: `_compile_heading_pattern` agora usa
  `@lru_cache(maxsize=64)`. As listas de marcadores são constantes
  module-level, então a mesma regex era recompilada ~2-3x por vaga
  (2k-3k recompilações por ciclo de 1000+ vagas).
- **Warm-load do Argos no boot**: `controllers.scrape_jobs` chama
  `prepare_translation(_WARMUP_LANGS)` em background no startup pra 27
  idiomas comuns. Elimina spikes de CPU quando a primeira vaga estrangeira
  de cada idioma chega no ciclo (era a fonte dos warnings de `stanza/mwt`
  que apareciam intermitentes no log).
- **`careerjet._looks_portuguese`**: trocou `sum(low.count(m) for m in
  _MARKERS)` (~30 passadas no texto por vaga) por uma única regex
  compilada (`_PT_MARKERS_RE.findall`). Cobre as 1800+ vagas/ciclo do
  Careerjet com uma passada O(N).
- **`lang_detect.detect_lang`**: mesma técnica aplicada ao detector
  global, usado por TODAS as engines (não só careerjet). Maior alcance
  que a otimização anterior.
- **uvloop**: `scrapy.py` ativa `uvloop.install()` quando disponível
  (Linux/macOS). Event loop em C com 20-30% de speedup em código async
  I/O-bound como o scraper. Windows cai gracilmente no asyncio default.

### Operação

- Sem migrations necessárias: a tabela `scraper_progress` já existe e
  aceita a nova chave `_controller/cycle` no schema atual.
- `uvloop` é instalado automaticamente em Linux/macOS via
  `requirements.txt` (`uvloop>=0.19.0; sys_platform != "win32"`).

## [3.0.0] - 2026-05-24

### 🎉 Marco do épico v3.0.0 — extração de responsabilidades + tradução multi-idioma

Cliente PT-BR sempre recebe vagas em **português** com `responsibilities`
extraído, independente do idioma de origem. Roadmap completo em
`docs/extraction-responsibilities.md`.

### Adicionado

**Pipeline central de enriquecimento:**

- `src/utils/section_extractor.py`: heurística de 5 camadas pra extrair
  o trecho de responsabilidades de uma description (HTML ou texto plano):
  1. Cabeçalho marcado (~80 marcadores PT + EN)
  2. Bullets dominantes (≥50% das linhas listadas)
  3. Texto antes do primeiro EXCLUDE marker (`Requisitos:`/`Benefícios:`)
  4. Verbo de ação no início (`Desenvolver/Manter/Atuar/...`)
  5. Densidade de substantivos de ação (`comercialização`, `prospecção`,
     etc.). Tolerante a encoding corrompido sem cedilha.
- `src/utils/lang_detect.py`: detecta `pt | en | ja | zh | ko | unknown`.
  CJK por faixa Unicode (hiragana/katakana → ja, hangul → ko, Han → zh).
  Latino via marcadores com peso pra diacríticos PT.
- `src/utils/job_enrichment.py`: helper compartilhado `enrich_async`/
  `enrich_canonical` que faz `detect → translate (se != pt) → extract`.
  Retorna `(lang, responsibilities, description_pt)`.

**Tradução automática:**

- Toda description em idioma diferente de PT é traduzida pra **PT-BR via
  Argos** (offline, sem chamada de rede) e gravada no banco em PT.
- `description_lang` preserva o idioma de **origem** (rastreabilidade).
- Idiomas suportados: en, ja, zh, ko (direto ou pivotando por en).

**17/17 engines integradas ao pipeline:**

- Globais: LinkedIn (lang variável)
- EN-only: Dice, RemoteOK, Remotive, WeWorkRemotely, ZipRecruiter
- PT-only: Indeed, Catho, InfoJobs, BNE, GeekHunter, Jooble,
  MichaelPage, ProgramaThor, SimplyHired, Gupy
- Multi-locale com tradução: Careerjet

**Backfill automático (`sonnar-backfill` no PM2):**

- Processo daemon que roda 24/7. Detecta vagas com `description_lang` ou
  `responsibilities` NULL, traduz + extrai + atualiza in-place no banco.
- Chunks de 100 vagas; idle de 10min quando fila vazia.
- Idempotente, resumível, sem intervenção manual.

**Formatter do bot (`apps/whatsapp/formatter`):**

- Lê `jobData.responsibilities` direto do banco (não extrai mais inline).
- Quando `responsibilities` está vazio/null, **omite** o bloco
  "Responsabilidades" do card. Sem fallback pra description bruta:
  cliente nunca recebe info errada.
- `appendResponsibilitiesBlock` formata como bullets (≤8) ou parágrafo
  curto (≤400 chars).

**Scripts de smoke pre-deploy:**

- `scripts/validate_engine.py`: testa 1 engine — métricas de extração,
  idioma, tradução. Opcional `--translate` chama Argos real.
- `scripts/validate_engines.py`: roda todas as engines em sequência,
  relatório consolidado.
- `scripts/show_failures.py`: lista vagas que falharam na extração
  pra investigar padrões.

**Schema do banco:**

- Migration `20260523120000_jobs_responsibilities_and_lang.sql`: colunas
  `responsibilities` (text) e `description_lang` (text) em `public.jobs`.

### Modificado

- `_merge_detail_over_seed`: tupla canônica expandiu de 10 → 12 campos
  (índices 10/11 = `description_lang`/`responsibilities`).
  Engines legadas continuam emitindo 10 e o normalizador lida via
  `len()` defensivo.
- `normalize_job_result`: aceita 10, 11 ou 12 campos.
- `build_job_payload` (`apps/scraper/src/persistence/jobs_repository.py`):
  payload Supabase/CSV/jobs.json inclui os 2 novos campos.
- `_PARSER_VERSION` bumpado em TODAS as 17 engines pra
  `2026-05-23/2026-05-24` — tracker re-busca vagas antigas.

### Métricas de aceitação (smoke real, 50 vagas/engine)

| Engine | Extração | Status |
|---|---|---|
| linkedin, dice, catho, gupy, michaelpage, programathor | ≥96% | ✅ |
| infojobs, geekhunter | 90% | ✅ |
| jooble | 86% | 🟡 quase no alvo |
| bne | 66% | ⚠️ teto natural (vagas vazias) |
| indeed | 28% | ⚠️ cap-by-source (Cloudflare trunca) |
| careerjet | 12% | ⚠️ cap-by-source (API trunca) |
| **TOTAL** | **79%** | — |

Tradução: 100% das vagas non-PT são traduzidas. Argos en→pt validado.

### Política de produto

- Cliente PT-BR **sempre** recebe description em português.
- Quando `responsibilities` não pode ser extraído (cap-by-source ou
  vagas genuinamente vazias), card vai sem o bloco "Responsabilidades"
  — **nunca info errada ou em outro idioma**.

### Operacional

- `OPERACAO.md` atualizado com a 5ª entry PM2 (`sonnar-backfill`).
- Doc do épico em `docs/extraction-responsibilities.md` marcado 9/9 ✅.
- Smoke report em `docs/smoke-report-v3.0.0.md`.

### Testes

- 239 testes unitários verdes (67 novos do épico).

## [2.16.0] - 2026-05-23

### Adicionado

- **Mudança de plano pelo portal** (DashboardSubscription):
  - **Pro → Plus**: upgrade imediato. Stripe troca o price item e prorateia
    a diferença (`proration_behavior='always_invoice'`). Em trial, o
    `trial_end` é preservado e nada é cobrado até o fim do trial.
  - **Plus → Pro**: downgrade agendado para o fim do período via
    `subscription_schedule` com 2 fases (Plus até `current_period_end`,
    depois Pro por 1 iteração). Sem reembolso, sem crédito.
  - **Pro/Plus → Free**: cancelamento agendado via `cancel_at_period_end`.
    Quando vira efetivo, a conta é rebaixada para `plan='free'`,
    `status='active'` (continua válida na Comunidade) em vez de `canceled`.
  - **Banner de agendamento** no hero com botão "Manter plano atual" que
    libera o schedule (Plus→Pro) ou desfaz `cancel_at_period_end`.
- **Novas edge functions**:
  - `change-plan`: dispatcher de upgrade/downgrade com guards (status
    diferente de active bloqueia, plano igual ao atual bloqueia,
    agendamento existente bloqueia).
  - `revert-scheduled-change`: libera schedule ou desfaz
    `cancel_at_period_end`.
- **Webhook stripe-webhook**:
  - Resolve o plano também via `price.id` (não só metadata), garantindo
    sincronia quando upgrade é feito por `subscriptions.update`.
  - Sincroniza `scheduled_plan='free'` + `scheduled_change_at` quando
    `cancel_at_period_end=true` chega.
  - Limpa `scheduled_*` quando o cliente reverte (apenas para
    `scheduled_plan='free'` sem schedule_id — não pisa em Plus→Pro).
  - Novos handlers para `subscription_schedule.released|completed|canceled`
    que limpam `stripe_schedule_id` e `scheduled_*`.
- **Migration `subscribers_scheduled_plan_change`** adicionando
  `scheduled_plan`, `scheduled_change_at` e `stripe_schedule_id` com
  CHECK de consistência e índice parcial por `stripe_schedule_id`.
- **Matriz de testes** em `docs/billing-plan-changes-test-matrix.md`
  com 11 cenários a validar no Stripe test mode antes do merge.

### Modificado

- `customer.subscription.deleted` agora rebaixa para Comunidade ativa
  em vez de marcar `status='canceled'`. A semântica antiga produzia
  contas inacessíveis no portal sem motivo claro.
- `DashboardSubscription.onCancel` migra de `cancel-own-subscription`
  para `change-plan` com `targetPlan='free'`, consolidando o fluxo.

### Stripe — exigências externas

- Endpoint de webhook precisa receber também os 3 eventos
  `subscription_schedule.released|completed|canceled`.
- Customer Portal: desabilitar "Customers can switch plans" para forçar
  swap pela UI (preserva a regra de downgrade só no fim do período).

## [2.14.0] - 2026-05-23

### Adicionado

- **Início da família PR 4 (extração de "responsabilidades" + tradução
  multi-idioma) — rumo a v3.0.0**:
  - **Documento de design** em `docs/extraction-responsibilities.md` com a
    análise de ~50 vagas por engine no banco, mapeamento dos cabeçalhos
    PT/EN que sinalizam "o que a pessoa faz", marcadores a ignorar (sobre
    empresa, requisitos, benefícios, etc.), estratégia de tradução por
    engine, e roadmap das sub-PRs (v2.14 → v3.0.0).
  - **Migration `jobs_responsibilities_and_lang`**: novas colunas opcionais
    em `public.jobs`:
    - `responsibilities TEXT` — texto extraído da description com apenas o
      "o que a pessoa faz", já traduzido pra PT quando aplicável.
    - `description_lang TEXT` — código ISO 639-1 do idioma detectado da
      description original (`pt`, `en`, `es`, ...).
  - Schema retrocompatível (campos opcionais) — código existente não quebra.

### Próximos passos (v2.15 → v3.0.0)

Conforme `docs/extraction-responsibilities.md`:
- v2.15.0 — Módulo de extração por seções (regex de cabeçalhos)
- v2.16.0 — Módulo de detecção de idioma centralizado
- v2.17.0 → v2.21.0 — Aplicação engine por engine (LinkedIn, Dice, EN-only,
  PT-only, Careerjet)
- v2.22.0 — Formatter usa `responsibilities` (fallback `description`)
- **v3.0.0** — marco oficial

## [2.13.1] - 2026-05-23

### Adicionado

- **Marcação explícita `expired_at` em `extraction_jobs`** (Supabase). Nova
  coluna `TIMESTAMPTZ` criada via migration `20260523…_extraction_jobs_expired_at`,
  com índice parcial (`WHERE expired_at IS NOT NULL`) pra queries
  observacionais. O revalidator agora, ao remover uma vaga do `jobs.json`,
  faz `PATCH /extraction_jobs?job_url=eq.<url>` setando `expired_at=NOW()`
  via novo método `tracker.mark_expired(url)`.

### Por quê

A proteção contra re-coleta já existia (via `state=completed` no
`tracker_known` carregado no startup). A marca `expired_at` adiciona:

1. **Observabilidade**: queries SQL tipo
   `SELECT engine, COUNT(*) FROM extraction_jobs WHERE expired_at IS NOT NULL GROUP BY engine`
   listam quais sites têm mais churn de vagas.
2. **Defesa em profundidade**: separa "vaga já coletada" (state=completed +
   expired_at IS NULL) de "vaga expirada e removida" (expired_at SET).
3. **Auditoria**: `expired_at` é timestamp do momento exato da remoção —
   útil pra debugar reclamações tipo "essa vaga sumiu, e antes?".

## [2.13.0] - 2026-05-23

### Adicionado

- **Revalidador automático de vagas próximas de 90 dias**. Novo módulo
  `apps/scraper/src/persistence/revalidator.py` que roda em background no
  scraper (task assíncrona, intervalo de 24h, primeira execução 5min após
  o startup pra não atrasar o boot). A cada ciclo:
  - Filtra vagas do `LocalJobStore` com `publication_date` entre **80 e
    90 dias atrás** (próximas do purge automático).
  - Faz HTTP GET na URL de cada uma (concorrência 3, timeout 20s,
    `follow_redirects=False` pra detectar redirects suspeitos).
  - Classifica: `expired` (HTTP 404/410), `active` (200), `unknown`
    (timeout, 5xx, redirect, erro de rede).
  - **Remove apenas as `expired`** via `DELETE /jobs/:id` no core (único
    escritor do `jobs.json`). Casos `unknown` ficam — preferimos manter
    vaga válida em rate-limit transitório do que apagar por engano.
  - Sincroniza o buffer in-memory do `LocalJobStore` via novo método
    público `delete_url(job_url)`.
- **Novo endpoint no `CoreJobsSink`**: `delete_job_by_url(url)` que
  calcula `md5(url)` (mesmo `deriveId` do core) e chama
  `DELETE /jobs/:id`. Trata 404 como sucesso (vaga já não estava no
  arquivo).
- Tunáveis via env (todos opcionais):
  - `REVALIDATE_AGE_MIN_DAYS` (default 80)
  - `REVALIDATE_AGE_MAX_DAYS` (default 90)
  - `REVALIDATE_INTERVAL_S` (default 86400 = 24h)
  - `REVALIDATE_STARTUP_DELAY_S` (default 300 = 5min)
  - `REVALIDATE_CONCURRENCY` (default 3)
  - `REVALIDATE_HTTP_TIMEOUT_S` (default 20)

### Motivação

Sem revalidação, vagas inativas (encerradas pelo anunciante antes dos 90
dias do purge) ficavam no `jobs.json` e eram enviadas pros assinantes
como se estivessem abertas — gerando ruído e candidaturas inúteis. Agora
saem do arquivo assim que o site marca como inexistente.

## [2.12.1] - 2026-05-23

### Corrigido

- **Formatter reiniciando ~12-15x/dia por estourar 400M do `max_memory_restart`**
  (`ecosystem.config.cjs`). O Canvas (geração de imagem dos cards) acumula
  buffers entre requests; com 400M de teto, o PM2 derrubava o processo via
  SIGTERM a cada ~30min (sem traceback nos logs porque o Node não chegava
  a crashar). Subo o teto para **600M** — o intervalo entre restarts deve
  dobrar para ~1h e o número diário cair pra ~6-8. Ainda dentro do
  orçamento de 8GB da VPS (~3.7GB total apps).

## [2.12.0] - 2026-05-23

### Modificado

- **`BATCH_SIZE` default reduzido de 5 → 2 stacks por batch**
  (`apps/scraper/src/controllers/controllers.py`). Prioriza qualidade da
  varredura sobre velocidade — com menos stacks por lote, cada engine faz
  menos requests por hora, ficando mais longe dos limites de rate-limit
  dos sites. A cobertura completa de todas as stacks acontece ao longo do
  dia (mais batches × 2h de pausa entre eles).

- **Jooble: rotação por relógio dos 15 listing variants**
  (`apps/scraper/src/engines/jooble.py`). Cada ciclo passa a varrer só
  **5 variants** (em vez de todas as 15), e o lote avança a cada 2h
  (mesmo padrão do Careerjet e LinkedIn). Reduz a pressão por ciclo —
  o Jooble retornava HTTP 403 do Cloudflare quando 15 variants × 5
  stacks viravam requests cascateados na mesma janela. Em ~6 ciclos
  (~12h) todos os variants são cobertos. O jitter entre variants subiu
  de 0.3s para 2-5s aleatório.

- **InfoJobs: detail-fetch concurrency reduzida de 8 → 2 + jitter
  explícito de 1-2s entre requests** (`apps/scraper/src/engines/infojobs.py`).
  Com 8 em paralelo o Cloudflare derrubava a sessão em rajada e o
  detail-fetch ficava em timeout. Com 2 + jitter, as vagas chegam sem
  bloqueio (custo: ciclo um pouco mais lento; aceitável porque há 2h
  de pausa entre batches).

### Observações

- **Indeed**: continua sob comportamento conhecido — o circuit breaker
  pausa a engine após sequência de falhas (`wait_s: 1800` / `3600` nos
  logs do servidor). Não é regressão; é proteção esperada.
- **GeekHunter**: 1 chamada GraphQL única, sem alteração estrutural. O
  timeout intermitente observado no smoke test não foi reproduzido em
  diagnóstico focado.

## [2.11.0] - 2026-05-23

### Adicionado

- **Checkpoint nas 9 engines restantes — todas as 14 engines do scraper
  agora retomam a varredura após restart.** Mesmo padrão das anteriores
  (resume por label, set_cursor antes de cada unidade, clear no fim),
  com granularidade ajustada pra estrutura de iteração de cada uma:
  - **Gupy** — cursor `{stack}`. 1 chamada API por stack.
  - **Jooble** — cursor `{stack, variant_idx}`. Multiplos filtros por stack.
  - **ZipRecruiter** — cursor `{stack, page}`. Paginação 1..10.
  - **SimplyHired** — cursor `{stack, page}`. Paginação até `SH_MAX_PAGES`.
  - **InfoJobs** — cursor `{stack, page}` na Fase 1 (`get_infojobs_links`).
    Paginação até `_LISTING_MAX_PAGES`.
  - **ProgramaThor** — cursor `{page}`. Sem stacks (catálogo já é tech).
  - **MichaelPage** — cursor `{category_idx, category}`. Itera 8 categorias
    pré-definidas.
  - **Remotive** — cursor `{category_idx, category}`. Itera 13 categorias
    da API.
  - **WeWorkRemotely** — cursor `{feed_idx, feed}`. Itera 9 feeds RSS.

  GeekHunter e RemoteOK ficam sem checkpoint propositalmente — fazem uma
  única chamada API (GraphQL e REST respectivamente) que devolve até 1000
  vagas de uma vez, então não há ponto intermediário que valha persistir.

### Resultado consolidado da família PR 3.x

Toda a varredura do scraper agora sobrevive a restarts: o `pm2 restart`
diário (04:00 BRT) e qualquer queda inesperada do processo retomam do
ponto exato em **todas as engines com loops de iteração**. As tabelas de
controle (`extraction_jobs` + `scraper_progress` no Supabase) preservam
estado completo entre execuções.

## [2.10.0] - 2026-05-23

### Adicionado

- **Engines BNE, Catho e Indeed agora retomam a varredura após restart**.
  Cada uma ganha checkpoint com a granularidade que faz sentido pra sua
  estrutura de iteração:
  - **BNE** (`apps/scraper/src/engines/bne.py`): área tech fixa
    (`informatica`), sem stacks. Cursor: `{page, area}`. Salvo dentro de
    `_scan_area` antes de cada página. No restart, retoma exatamente da
    página onde parou (até 50 páginas sem checkpoint = até 50 páginas
    refeitas; com checkpoint = 1 página max).
  - **Catho** (`apps/scraper/src/engines/catho.py`): cursor `{stack, page}`
    — mesma granularidade do Dice. Salvo antes de cada página.
  - **Indeed** (`apps/scraper/src/engines/indeed.py`): cursor
    `{stack, variant_idx}` — Indeed não tem paginação interna (só 1 página
    por variant), então o cursor reflete o índice do filtro em
    `_LISTING_VARIANTS`. Salvo antes de cada combinação.
  - Em todas as três, retomada por **label da stack/área** (não índice) —
    cursor é descartado se a stack salva não está no batch atual. Ao
    concluir o ciclo, `progress.clear` apaga o cursor.

### Corrigido

- **Indeed: clear de cursor no caminho de zero vagas**. Quando o filtro
  tech descartava todas as vagas relevantes (early return em
  `get_indeed_jobs`), o cursor ficava no banco — o próximo batch
  começaria do checkpoint anterior em vez de zero. Agora o `progress.clear`
  é chamado também nesse caminho.

## [2.9.0] - 2026-05-23

### Adicionado

- **Engine Dice agora retoma a varredura após restart**. Em
  `apps/scraper/src/engines/dice.py`:
  - **Checkpoint por `(stack, page)`**. Diferente do LinkedIn/Careerjet
    (que checkpointam só por combinação), no Dice cada stack pode varrer
    até 50 páginas (`DICE_MAX_PAGES`) — então a página atual também é
    persistida pra evitar refazer dezenas de páginas no restart. Antes
    de cada página, `progress.set_cursor("dice", batch_key, {...})` grava
    a posição; ao reiniciar, `progress.resume` devolve a página exata e o
    loop pula direto pra ela. A retomada é por **label da stack** (não
    índice) — se a stack salva não está mais no batch atual, o cursor é
    descartado. Ao concluir o ciclo, `progress.clear` apaga o cursor.

## [2.8.0] - 2026-05-23

### Adicionado

- **Engine Careerjet agora retoma a varredura após restart**. Em
  `apps/scraper/src/engines/careerjet.py`:
  - **Checkpoint fino** por combinação `(locale, stack, variant)`. Antes de
    cada combinação chama `progress.set_cursor("careerjet", batch_key, {...})`;
    ao reiniciar, `progress.resume` devolve a posição salva e o loop pula
    direto pra ela. A retomada é por **label** (não índice), então sobrevive
    a mudanças no lote rotativo de locales — se o `locale` salvo não está no
    `_active_locales()` atual, o cursor é descartado e o batch reinicia do
    zero. Ao concluir o ciclo, `progress.clear` apaga o cursor.
  - O Careerjet já tinha rotação por relógio dos 140 locales estrangeiros
    (10 por ciclo, cobertura em ~28h) e varredura completa das 27 UFs do
    Brasil — agora ganha persistência de posição entre restarts.

## [2.7.0] - 2026-05-23

### Adicionado

- **Engine LinkedIn agora retoma a varredura após restart, e cobre o mundo
  todo + os 27 estados brasileiros via rotação por relógio**. Em
  `apps/scraper/src/engines/linkedin.py`:
  - **Checkpoint fino**: antes de cada combinação `(stack, region, sort)`
    chama `progress.set_cursor("linkedin", batch_key, {...})`; ao reiniciar,
    `progress.resume` devolve a posição salva e o loop pula direto pra ela.
    A retomada é por **label** (não índice), então sobrevive a mudanças no
    lote rotativo de regiões. Se o label salvo não está no lote atual, o
    cursor é descartado e o batch reinicia do zero. Ao concluir o ciclo,
    `progress.clear` apaga o cursor.
  - **Pool de regiões expandido pra ~47**: 27 UFs do Brasil (Acre →
    Tocantins) + ~20 países com mercado tech relevante (US, UK, Portugal,
    Espanha, França, Alemanha, Países Baixos, Irlanda, Itália, Suécia,
    Bélgica, Suíça, Canadá, México, Argentina, Chile, Colômbia, Austrália,
    Singapura, Japão).
  - **Rotação por relógio** (mesmo padrão do Careerjet): `Brasil` é sempre
    incluído (busca nacional, base do tráfego); o restante é um lote
    rotativo de tamanho `LINKEDIN_REGION_BATCH_SIZE` (default **5**) que
    avança a cada `LINKEDIN_REGION_ROTATION_INTERVAL_S` (default **2h**,
    casa com `BATCH_INTERVAL_SECONDS`). Em ~20h de ciclos, o pool inteiro
    é coberto.

### Modificado

- **LinkedIn: paginação por combinação reduzida de 20 → 10 páginas**
  (`LINKEDIN_LISTING_MAX_START` de 500 → 250, mantendo step 25). A
  cobertura geográfica ampliada compensa a paginação mais rasa, e a
  pressão por combinação cai pela metade — menos risco de bloqueio.

## [2.6.3] - 2026-05-22

### Adicionado

- **Infraestrutura de checkpoint pra retomar a varredura após restart**:
  nova tabela `public.scraper_progress` no Supabase (migration
  `20260522…_scraper_progress`) com chave primária `(engine, batch_key)`
  e `cursor` JSONB de shape livre. Novo módulo
  `apps/scraper/src/persistence/progress_tracker.py` expõe a API que cada
  engine vai consumir: `set_cursor(engine, batch_key, cursor)` (buffer
  in-memory, não bloqueia), `resume(engine, batch_key)` (lê do banco no
  startup; devolve `None` se o batch mudou), `clear(engine, batch_key)`
  (DELETE imediato ao concluir o batch). Flusher de fundo faz upsert em
  batch a cada 5s, então engines podem chamar `set_cursor` a vontade sem
  custo de I/O. Em `apps/scraper/variavel.py` adiciono
  `set_active_batch_context` / `get_active_batch_key` pra que cada engine
  saiba qual `batch_key` (`cat=<categoria>|idx=<n>`) usar; o
  `controllers.py` seta o contexto antes de cada lote e sobe o flusher do
  progress junto com os outros. **Esta entrega não modifica nenhuma
  engine** — só prepara a infra. As engines serão instrumentadas em PRs
  separados (LinkedIn primeiro, depois Careerjet, Dice, BNE/Catho/Indeed
  e o restante).

## [2.6.2] - 2026-05-22

### Adicionado

- **Rotação mensal automática do `job.csv` no scraper**: o sink CSV
  append-only (`apps/scraper/src/persistence/csv_store.py`) cresce
  indefinidamente, e o `CSVJobStore` carrega todas as URLs do arquivo num
  set no startup pra dedup. Sem rotação, a cada mês o startup ficaria mais
  pesado. Agora, no startup, se o `mtime` do `job.csv` é de um mês anterior,
  o arquivo é renomeado para `job-YYYY-MM.csv` (mês da última modificação)
  e um novo arquivo vazio é iniciado. A dedup mais ampla continua coberta
  pelo `LocalJobStore` (`jobs.json`) e pelo `ExtractionTracker` (Supabase),
  então a "perda" do set entre meses não causa duplicatas reais no
  pipeline. Arquivos rotacionados ficam em `apps/scraper/src/data/` lado a
  lado e prontos para análise offline (Excel, Pandas, BI).

- **Restart diário do scraper documentado em `OPERACAO.md`**: o processo
  Python sofre fragmentação de heap depois dos picos de coleta — mesmo
  ocioso na pausa de 2h, segura ~1.3 GB porque o allocator do CPython
  raramente devolve memória ao SO. A `OPERACAO.md` agora traz o comando
  de cron pra reiniciar o scraper 1x/dia às 04:00 BRT (cai com alta
  probabilidade na pausa de 2h entre lotes). Nenhuma vaga se perde: o
  `ExtractionTracker` persiste o estado de cada URL no Supabase
  (`extraction_jobs`), e o startup retoma de onde parou.

## [2.6.1] - 2026-05-22

### Corrigido

- **Planos anunciavam recursos que não são entregues hoje**: a página de
  planos (`PricingSection.vue`), a tela de cadastro (`SignupPage.vue`) e o
  painel do assinante (`DashboardSubscription.vue`) descreviam features
  inexistentes. O plano **Pro** prometia "filtros por stack, senioridade e
  modelo", mas a entrega do Pro é via grupo de WhatsApp — que recebe
  **todas** as vagas, sem filtro por perfil (filtro é exclusivo do Plus).
  As features do **Plus** "curadoria humana semanal" e "relatório semanal
  de mercado" ainda não foram implementadas. Correções: a promessa de
  filtros foi removida do Pro em todos os pontos; "curadoria humana" e
  "relatório semanal" do Plus passam a exibir o selo **Em breve**. A copy
  agora reflete apenas o que é entregue hoje.

## [2.6.0] - 2026-05-22

### Adicionado

- **Card de comunidades no dashboard do plano free**: o plano Comunidade
  (free) não recebe vagas personalizadas, mas tem acesso aos canais
  públicos do Sonnar. O novo componente `CommunityCard.vue` exibe os links
  oficiais de Discord e WhatsApp no `DashboardJobs.vue`, renderizado apenas
  quando `subscriber.plan === 'free'`. Os links das comunidades ficam
  centralizados no próprio componente, como fonte única.

### Corrigido

- **Link do grupo de WhatsApp na tela de sucesso**: o `SuccessScreen.vue`
  apontava para um convite de grupo antigo. Atualizado para o convite
  vigente da comunidade.

## [2.5.2] - 2026-05-22

### Corrigido

- **`sonnar-scraper` em loop de reinício após ativar a tradução**: o teto
  de memória do processo no PM2 (`max_memory_restart`) era de 1024 MB,
  definido quando a VPS tinha 4 GB. A VPS hoje tem 8 GB e a engine
  careerjet carrega modelos de tradução (Argos) na RAM — o processo
  passava de 1 GB e o PM2 o reiniciava em loop, sem concluir a coleta. O
  teto sobe para 2048 MB, com folga de sobra na máquina de 8 GB; os
  comentários do `ecosystem.config.cjs` e o `OPERACAO.md` foram
  atualizados para 8 GB.
- **Testes assíncronos falhando na coleta**: os casos de `test_core_sink`
  usam `@pytest.mark.asyncio`, mas o plugin `pytest-asyncio` não estava
  declarado nas dependências. Adicionado — a suíte volta a 102 testes
  passando (antes 97 passando, 5 falhando).

## [2.5.1] - 2026-05-22

### Corrigido

- **Layout do painel do assinante quebrado pelos anúncios do AdSense**:
  o runtime do AdSense injeta altura na página, o que gerava rolagem no
  nível da janela e fazia a barra lateral descolar do topo. O shell do
  dashboard passa a ficar fixo na viewport (`position: fixed`) com a
  rolagem travada no `body` — só a área de conteúdo rola. A grade de
  vagas passa a 6 colunas a partir de 1200px (alinhada ao anúncio, que
  ocupa a linha inteira a cada 6 cards) e o slot de anúncio é colapsado
  quando o AdSense não tem anúncio para servir
  (`data-ad-status="unfilled"`), evitando uma caixa vazia entre as vagas.

## [2.5.0] - 2026-05-22

### Adicionado

- **Engine Careerjet multi-país com tradução automática**: a coleta de
  vagas do Careerjet, antes restrita ao Brasil via scraping de HTML,
  passa a usar a API v4 oficial e cobre os 141 `locale_code` suportados
  (Brasil + 140 países). Os países estrangeiros entram em rodízio por
  ciclo; o Brasil é processado em todo ciclo, com a busca nacional mais
  uma busca por cada uma das 27 UFs. Vagas em outros idiomas têm título
  e descrição traduzidos para português antes de salvar, por um tradutor
  offline (Argos Translate) — tradução direta quando há o par de
  idiomas, com pivô por inglês quando não há. Exige a nova dependência
  `argostranslate` e a variável `CAREERJET_API_KEY` no `.env`.

### Alterado

- A engine `careerjet` deixa de raspar o HTML de `careerjet.com.br` e
  passa a consumir a API `search.api.careerjet.net`. É listing-only (sem
  reenriquecimento), já que a API serve a descrição como excerto; o
  domínio de métricas do controller acompanha a mudança.

## [2.4.2] - 2026-05-21

### Corrigido

- **Gráficos do painel do scraper travavam em loop de erro no console**: a
  animação do ECharts no `TabChartCard.vue` disparava um `TypeError: Cannot
  read properties of undefined (reading 'length')` a cada quadro
  (`onframe`), inundando o console na página `/admin/scraper`. A animação foi
  desabilitada no wrapper do gráfico — os gráficos renderizam estáticos e
  estáveis, sem perda de informação.
- **404 de chunk após deploy deixava a navegação travada**: as páginas são
  lazy-loaded por chunks com hash no nome. Uma aba aberta antes de um deploy
  ainda tinha o `index.html` antigo em memória e, ao navegar, tentava importar
  chunks já substituídos (`Failed to fetch dynamically imported module`). O
  router passa a detectar essa falha e recarregar a página uma única vez por
  destino, buscando o `index.html` atual (servido com `no-cache`) e os hashes
  vigentes. Há guarda contra loop caso o problema seja um deploy realmente
  inconsistente.

## [2.4.1] - 2026-05-21

### Corrigido

- **Banner de cookies próprio empilhava sobre o diálogo da CMP do Google**:
  com os anúncios da 2.4.0, ao ativar a CMP do Google (mensagem de
  consentimento GDPR do AdSense), um visitante do EEE / Reino Unido / Suíça
  veria dois banners ao mesmo tempo — o `CookieBanner.vue` e o diálogo da CMP.
  O `CookieBanner.vue` passa a consultar a API IAB TCF (`window.__tcfapi`):
  quando a CMP do Google se aplica ao visitante (`gdprApplies`), o aviso de
  LGPD fica oculto e a CMP cuida do consentimento; caso contrário, o aviso é
  exibido como antes. Se a CMP ainda não estiver publicada no AdSense, o
  polling expira e o comportamento é o atual — a mudança é segura mesmo antes
  de configurar a mensagem.
- **CSP não liberava o diálogo de consentimento da CMP**: a CMP do Google
  carrega de `fundingchoicesmessages.google.com`. O `script-src` e o
  `connect-src` já cobriam o domínio (`*.google.com`), mas o `frame-src` não —
  adicionado para o diálogo de consentimento renderizar sem bloqueio.

## [2.4.0] - 2026-05-21

### Adicionado

- **Anúncios do Google AdSense no dashboard de vagas**: o grid de vagas do
  dashboard (`DashboardJobs.vue`) passa a intercalar uma unidade de anúncio a
  cada 6 cards. O novo componente `AdSlot.vue` encapsula o `<ins>` do AdSense e
  enfileira a requisição no `onMounted` — cada montagem cria um `<ins>` novo,
  então a navegação SPA não dispara o erro *"All 'ins' elements already have
  ads"*. A unidade usa o formato in-article/fluid e ocupa a linha inteira do
  grid, separando blocos de cards sem se passar por uma vaga. O loader
  `adsbygoogle.js` é carregado uma única vez no `index.html`.

### Alterado

- **Content Security Policy relaxada para suportar o AdSense**: o runtime de
  anúncios do Google injeta scripts inline e usa `eval`, incompatíveis com a
  CSP estrita anterior. Foram adicionados `'unsafe-inline'` e `'unsafe-eval'` ao
  `script-src`, além dos domínios `googlesyndication`, `googleadservices`,
  `doubleclick`, `google.com` e `adtrafficquality.google` em `script-src`,
  `frame-src` e `connect-src`. Os hashes dos dois blocos JSON-LD foram removidos
  porque o navegador ignora `'unsafe-inline'` quando há hash na diretiva.

### Segurança

- **Trade-off de XSS assumido**: relaxar o `script-src` enfraquece a defesa
  contra XSS — como o JWT da sessão vive em `localStorage` (padrão do Supabase
  Auth em SPA), um script injetado ainda conseguiria exfiltrá-lo. A decisão foi
  assumida em troca da monetização por anúncios e está documentada no
  comentário da CSP em `index.html`, com instruções de reversão caso os
  anúncios sejam removidos no futuro.

## [2.3.5] - 2026-05-21

### Corrigido

- **Scraper quebrava ao subir sem `SCRAPER_PYTHON` exportado**: o
  `ecosystem.config.cjs` resolvia o interpretador como `SCRAPER_PYTHON ||
  python3`. Como `SCRAPER_PYTHON` só é exportado dentro do `setup-vps.sh`,
  qualquer `pm2 start ecosystem.config.cjs` (ou recriação do processo) sem
  essa variável caía no `python3` do sistema — sem as dependências da
  `requirements.txt` — e o scraper entrava em crash-loop com
  `ModuleNotFoundError: No module named 'dotenv'`. Agora o ecosystem
  **detecta a virtualenv `apps/scraper/.venv` automaticamente** e só recorre
  ao python do sistema se ela não existir. `SCRAPER_PYTHON` segue válido como
  override explícito.

## [2.3.4] - 2026-05-21

### Corrigido

- **Código de pareamento do WhatsApp ia para o número errado**: o
  `VITE_WHATSAPP_PHONE` no `.env.production` da web apontava para
  `5531998478235`. O deep-link de pareamento do dashboard
  (`wa.me/<numero>?text=parear <token>`, em `DashboardJobs.vue`) enviava o
  código para esse número em vez do número correto do bot
  (`5531999738235`). Corrigido o valor. **Exige rebuild + redeploy da web** —
  variável `VITE_` é embutida no bundle em build-time.

## [2.3.3] - 2026-05-21

### Corrigido

- **Purge de vagas antigas quebrava quando não havia o que purgar**: o
  `purgeStaleJobs` comparava `removed > 0`, mas `removed` pode ser o Symbol
  `SKIP_WRITE` (devolvido pelo `updateJobsFile` quando não há gravação).
  Comparar um Symbol com `>` lança `TypeError: Cannot convert a Symbol value
  to a number`. Em todo ciclo sem vaga antiga (no boot ou a cada 6h) o purge
  logava `falha no purge de vagas antigas`. Agora checa `!== SKIP_WRITE`
  antes da comparação, como os outros três usos do sinal já faziam.
- **Traceback de encerramento do scraper silenciado de vez**: a 2.3.0 tratou
  o `KeyboardInterrupt`, mas o `CancelledError` que o `asyncio` dispara ao
  cancelar as tasks de fundo no shutdown ainda vazava um traceback no log de
  erro a cada `pm2 restart`. Um handler de exceção do loop ignora o
  `CancelledError` esperado e o `except` do topo passou a cobrir os dois
  tipos. Encerramento esperado não é erro.

### Alterado

- **Timestamps dos logs em data/hora brasileira**: a saída de console do
  scraper passou a incluir a data (`DD/MM/AAAA HH:MM:SS`) e o logger do
  formatter idem. O horário acompanha o fuso do servidor — defina
  `America/Sao_Paulo` na VPS. O log-arquivo JSON do scraper segue em UTC ISO
  (formato de máquina, para parsing).
- **`kill_timeout` do scraper subiu para 10 s**: o PM2 dava só 1,6 s entre o
  `SIGINT` e o `SIGKILL`, e o scraper era morto à força — cortando um
  `POST /jobs/batch` em andamento e podendo deixar processos Chromium órfãos
  consumindo RAM. Com 10 s ele fecha o ciclo e o browser antes de sair.

### Adicionado

- `scripts/verificar.sh` — checagem rápida pós-deploy: status do PM2, erros
  nos logs, health do core, middleware de erro JSON, stats e testes unitários.

## [2.3.2] - 2026-05-21

### Corrigido

- **Resposta de erro do core sempre em JSON**: um corpo JSON malformado caía no
  handler padrão do Express (resposta HTML e stack trace no log). Um middleware
  de erro passa a responder `400` JSON consistente e a registrar erros não
  previstos sem despejar stack no stderr.
- **Sinal de "pular gravação" explícito no `updateJobsFile`**: ao não gravar, a
  função devolve `SKIP_WRITE` em vez de `undefined`, eliminando a ambiguidade
  com um mutator que retorne `undefined` por engano (apontado no review da 2.3.1).

## [2.3.1] - 2026-05-21

### Corrigido

- **Escrita do `jobs.json` agora é transacional**: o ciclo ler → modificar →
  gravar passou a rodar inteiro dentro da fila de escrita serializada. Antes,
  a fila serializava só a gravação — dois handlers do core (ex.: `POST
  /jobs/batch` e `PUT /jobs/status`) podiam ler a mesma versão do arquivo e o
  último a gravar sobrescrevia o outro (*lost update*). O single-writer da
  2.3.0 matou a corrida **entre processos**; esta corrige a corrida **entre os
  handlers do próprio core**. Vale também para o `purgeStaleJobs`.
- **Falha de escrita não vira mais sucesso silencioso**: `updateJobsFile`
  propaga o erro em vez de engoli-lo, e os endpoints respondem `500` quando a
  gravação falha. Sem isso, o `POST /jobs/batch` podia responder `200` sem
  persistir, fazendo o scraper descartar as vagas da fila de reenvio.
- **`CORE_PUSH_CHUNK_SIZE` inválido quebrava o envio ao core**: um valor zero,
  negativo ou não-numérico estourava o `range()` do fatiamento. Agora é
  validado (mínimo 1) e cai no default 500, com aviso no log.
- **`JOBS_MAX_AGE_DAYS` inválido**: valor não-finito ou negativo era aceito;
  agora é validado (mínimo 1 dia) e cai no default de 90.
- **Limite de corpo HTTP do core por rota**: o `express.json` de 25 MB era
  global. Voltou a 1 MB por padrão; o limite de 25 MB vale só para o
  `POST /jobs/batch`, reduzindo a superfície de memória/DoS do parser.

### Adicionado

- Testes unitários do `CoreJobsSink` — fatiamento em chunks, falha de chunk
  intermediário, cliente não inicializado e erro de rede.

## [2.3.0] - 2026-05-21

### Adicionado

- **`jobs.json` com escritor único (single-writer)**: o `message-formatting-core`
  passa a ser o **único processo que grava o `jobs.json`**. O scraper não escreve
  mais o arquivo — coleta as vagas, mantém um buffer em memória e as envia ao core
  pelo novo endpoint `POST /jobs/batch` (em chunks, para não estourar o limite de
  corpo da request). Antes, scraper e core gravavam o mesmo arquivo ao mesmo tempo:
  uma corrida que causava `ENOENT` no rename do temporário e fazia o scraper apagar
  marcações de envio (`sent_to`) recém-feitas pelo core. Se o core estiver fora do
  ar, o scraper retém as vagas em memória e reenvia quando ele volta — o dedup do
  scraper segue lendo o `jobs.json` no startup, sem mudança.
- **Purge de vagas antigas no core**: a remoção de vagas com `publication_date`
  acima de 90 dias (configurável via `JOBS_MAX_AGE_DAYS`) passa a ser feita pelo
  core — no boot e a cada 6h —, já que ele é o único escritor do arquivo.

### Corrigido

- **`Falha ao gravar jobs.json` (`ENOENT`)**: eliminado por construção pelo
  single-writer acima. Como reforço, o nome do arquivo temporário da escrita
  atômica passou a incluir o PID, impedindo que um processo renomeie o `.tmp`
  de outro.
- **`sent_to` sobrescrito pelo scraper**: o core nunca mais perde marcações de
  envio — o `POST /jobs/batch` preserva o `sent_to` em disco e ignora o que o
  scraper enviar. Evita que vagas já enviadas sejam reenviadas aos usuários.
- **Corpo JSON inválido poluía o log de erro do API Receiver do WhatsApp**: um
  `POST` com JSON malformado gerava `SyntaxError` com stack trace no log do PM2.
  Adicionado middleware de erro que responde `400` limpo, sem despejar o stderr.
- **Traceback de `KeyboardInterrupt` no scraper**: parar/reiniciar o serviço
  via PM2 (SIGINT) despejava um traceback gigante no log de erro. O encerramento
  agora é tratado como evento esperado.
- **Documentação do teto de memória do core**: `OPERACAO.md` indicava 250 MB,
  mas o `ecosystem.config.cjs` já usa 512 MB (o core faz `JSON.parse` do
  `jobs.json` inteiro a cada request). Tabela e orçamento de RAM corrigidos.

## [2.2.1] - 2026-05-19

### Corrigido

- **Checkout do portal falhava com erro 500 ao clicar em "Ir para pagamento"**:
  a função `create-checkout-session` ligava `tax_id_collection` reusando um
  `customer` existente do Stripe sem informar `customer_update`. O Stripe
  rejeitava a criação da sessão (`Tax ID collection requires updating business
  name on the customer`). Adicionado `customer_update: { name: "auto", address:
  "auto" }`, alinhando com o fix já aplicado no `create-vip-checkout` (v2.1.4).

## [2.2.0] - 2026-05-19

### Adicionado

- **Autenticação por token no API Receiver do bot de WhatsApp**: os endpoints
  `POST /send` e `POST /send-batch` (porta 3002) passam a exigir o header
  `Authorization: Bearer <token>`, validado em tempo constante contra a nova
  variável `WHATSAPP_API_TOKEN`. Sem token configurado o servidor recusa todas
  as requisições (fail-safe `503`). Habilita o consumo seguro da API por
  serviços externos. `/health` e `/status` seguem públicos.
- **`setup-vps.sh`**: script de bootstrap da VPS que instala as dependências
  dos quatro apps e sobe tudo via PM2 num único comando.
- **Documentação da integração WhatsApp API ↔ portal** em
  `docs/vault/09-infra/whatsapp-api-elkys-integration.md`.

## [2.1.6] - 2026-05-18

### Corrigido

- **Assinante VIP de cartão não recebia o e-mail de acesso ao portal**: o
  trigger `handle_new_user` montava `subscriber_profiles` no shape do cadastro
  do portal (Fluxo A). O VIP do WhatsApp (Fluxo B) envia o perfil com outro
  shape — `seniority` como array, chaves no plural, sem `whatsapp` — e como
  essas colunas são `NOT NULL` o `INSERT` estourava e abortava a criação da
  conta. Resultado: `invite-whatsapp-subscriber` retornava 500 e o e-mail
  nunca era enviado. O trigger agora aceita os dois shapes e, em último caso,
  nunca deixa o perfil bloquear a criação da conta.

## [2.1.5] - 2026-05-18

### Corrigido

- **"Opção inválida" ao mandar "oi" após a sessão expirar**: ao encerrar a
  sessão por inatividade o bot voltava o estado para `menu` sem reexibir o
  menu, então uma saudação caía como opção inválida. Agora saudações (`oi`,
  `olá`, `bom dia`...) em estado de navegação reabrem o menu principal.

### Alterado

- O link de Checkout do Stripe (URL longa) agora é encurtado para
  `sonnarjobs.com.br/v/<code>` antes de ser enviado no WhatsApp.

## [2.1.4] - 2026-05-18

### Corrigido

- **Checkout VIP por cartão falhava para customer já existente**: a edge
  function `create-vip-checkout` criava a sessão com `tax_id_collection`
  habilitado mas sem `customer_update`. Ao reaproveitar um customer do Stripe
  (por LID ou e-mail) o Stripe rejeitava com "Tax ID collection requires
  updating business name on the customer". Adicionado
  `customer_update: { name: "auto", address: "auto" }`.

## [2.1.3] - 2026-05-18

### Corrigido

- **Checkout VIP enganava lead já ativo**: ao gerar o link de pagamento por
  cartão, qualquer falha caía na mensagem genérica "Não consegui gerar o link
  / tente de novo / PIX". Quando o motivo era `already_active` (o lead já é
  VIP ativo), isso sugeria erro transitório e oferecia pagar de novo. Agora
  esse caso tem mensagem própria avisando que a assinatura está em dia.

## [2.1.2] - 2026-05-18

### Corrigido

- **Falha intermitente ao gravar `jobs.json` no Windows**: o `sonnar-core` e o
  `sonnar-scraper` escrevem o mesmo arquivo e o rename atômico falhava com
  `EBUSY` / `WinError 5` quando o outro processo o tinha aberto. O core, que
  não tinha retentativa alguma, agora tenta o rename 12× com intervalo; o
  retry do scraper foi ampliado para 12 tentativas com backoff progressivo.

## [2.1.1] - 2026-05-18

### Corrigido

- **Encurtador de URL não funcionava no formatter**: o `server.js` nunca
  carregava o `.env` e o `urlShortener.js` lia `WEB_FUNCTIONS_URL` /
  `WHATSAPP_LINK_SECRET` no topo do módulo — avaliado antes do `dotenv`. As
  variáveis chegavam vazias e a vaga era enviada com a URL longa. Agora o
  `.env` é carregado antes de tudo e a leitura do ambiente é feita por chamada.

## [2.1.0] - 2026-05-18

Release que entrega o **encurtador de URL próprio** e o **VIP do WhatsApp como
assinatura recorrente**. Consolida o PR #21 (encurtador de URL + VIP recorrente
do WhatsApp).

### Adicionado

- **Encurtador de URL próprio**: edge function `shorten-url` e tabela
  `short_links`, gerando links curtos no domínio do projeto
  (`sonnarjobs.com.br/v/<code>`). O formatter (`urlShortener.js`) encurta a URL
  da vaga ao montar o card, com degradação graciosa — se o serviço falhar ou
  não estiver configurado, devolve a URL original sem bloquear o envio.
- **VIP do WhatsApp como assinatura recorrente do Stripe**: backend de cobrança
  recorrente, fluxo de pagamento no bot do WhatsApp e notificações de cobrança.
- **Dados fiscais no checkout**: coleta de CPF/CNPJ no checkout do portal, agora
  obrigatório no Checkout do Stripe.

### Removido

- Encurtadores de URL gratuitos (tinyurl/cleanuri) e o módulo órfão
  `cardApi.js` do formatter, substituídos pelo encurtador próprio.

## [2.0.0] - 2026-05-18

Marco que transforma o Sonnar de um **bot de scraping para Discord** em um
**SaaS B2C multicanal de matching de vagas de tecnologia**. O repositório passou
a monorepo, ganhou portal web, bot de WhatsApp, banco de dados, pagamentos e um
pipeline de coleta com 15+ fontes. É um release **major**: a arquitetura, o
modelo de distribuição e o produto mudaram por completo em relação à linha 1.x.

### Adicionado

- **Portal web** (`apps/web`, Vue 3 + Vite): landing pública
  (`sonnarjobs.com.br`), dashboard do cliente (vagas, assinatura, perfil de
  busca) e portal administrativo (gestão de subscribers, criação manual de
  cliente, gestão de admins).
- **Bot de WhatsApp** (`apps/whatsapp/sender`, Baileys): distribuição de vagas,
  grupo de vagas, gestão de assinantes VIP e fluxo de aprovação de pagamento.
- **Gerador de cards** (`apps/whatsapp/formatter`): imagens 1080×1080 de vaga
  via Canvas, com legenda profissional e preview de link.
- **`message-formatting-core`**: API HTTP central (porta 3100) que serve o
  `jobs.json` para todos os canais, desacoplando os bots da fonte de dados.
- **Integração com Supabase**: Postgres com RLS, Auth (PKCE), Edge Functions
  (Stripe, OTP, admin) e Storage. Schema versionado em `supabase/migrations/`.
- **Pagamentos via Stripe**: planos free / pro / plus, webhook de confirmação e
  quota mensal de busca.
- **Motor de matching**: recomendação de vagas por área de atuação (13 áreas) e
  senioridade refinada, com pesos e gate de área.
- **Pipeline de scraping ampliado**: engines para BNE, Careerjet, Catho, Dice,
  GeekHunter, Gupy, Indeed, InfoJobs, Jooble, LinkedIn, Michael Page,
  SimplyHired e outras — extração de detalhe por link, critérios parciais por
  engine e normalização de localidade.
- **Bot de Discord** (`apps/discord/sender` + `apps/discord/formatter`):
  formatação e envio de vagas em embeds.
- **Observabilidade do scraper**: tracker de execução, checkpoint, DLQ, logs
  legíveis e circuito de retry na tradução.
- **Vault Obsidian** (`docs/vault/`): second brain operacional com arquitetura,
  fluxos, ADRs (001–005) e catálogo de débito técnico.
- **CI/CD** (GitHub Actions): validação de nome de branch (git-flow), lint+build
  do web, deploy automático para a Hostinger via FTP, análise de bundle e
  auditoria de segurança semanal.

### Modificado

- **Reestruturação para monorepo** (ADR-004): código reorganizado em `apps/`,
  `packages/`, `supabase/`, `docs/` e `scripts/`.
- **Arquitetura de microsserviços**: coleta, formatação e envio agora são
  serviços independentes orquestrados via PM2 (`ecosystem.config.cjs`).
- Mensagens e cards redesenhados com tipografia e legendas profissionais.
- Cadastro ampliado com endereço PF/PJ e filtros avançados de perfil.

### Corrigido

- Diversas correções de coleta: recuperação de processos zumbis do scraper,
  extração de JSON de listagem do Indeed (ADR-003), URLs vazias do InfoJobs,
  redirecionamento de candidatura do Dice, completude do LinkedIn e
  sincronização de domínio `www`.
- Gravação do `jobs.json` no Windows e encurtador de URL.
- Respostas duplicadas do WhatsApp em reconexão.

### Removido

- Landing page antiga, substituída pelo novo portal web.

### Segurança

- Endurecimento de autenticação: fluxo PKCE em todo OAuth, sanitização de
  `?redirect=` e migração de `OWNER_EMAIL` para variável de ambiente
  (ADR-001, ADR-002).
- Troca de senha obrigatória no primeiro acesso do portal (Fluxo B).
- Armazenamento seguro de credenciais e segregação por RLS no Postgres.

## [1.1.1] - 2023

- Ajustes na configuração do `keyring` para segurança do token e do canal.

## [1.1.0] - 2023-12-13

- Eficiência do mecanismo de busca de vagas aprimorada.
- Suporte a mais sites de busca de emprego.
- Melhoria na formatação das mensagens enviadas.
- Biblioteca `keyring` adicionada para segurança do token e do canal do Discord.

## [1.0.0] - 2023-09-01

- Busca automática de vagas em site específico.
- Detecção de vagas duplicadas.
- Envio de vagas para um canal do Discord.
- Lógica para evitar envio de vagas repetidas.
- Intervalos de busca personalizáveis.

[2.1.6]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.5...v2.1.6
[2.1.5]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.1.1...v2.0.0
[1.1.1]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/releases/tag/1.0.0
