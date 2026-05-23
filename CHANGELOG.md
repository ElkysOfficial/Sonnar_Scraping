# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
