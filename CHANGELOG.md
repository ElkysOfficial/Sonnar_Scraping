# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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

[2.1.1]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.1.1...v2.0.0
[1.1.1]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/ElkysOfficial/Sonnar_Scraping/releases/tag/1.0.0
