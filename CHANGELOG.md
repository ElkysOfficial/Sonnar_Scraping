# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
