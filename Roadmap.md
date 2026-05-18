# Roadmap do Projeto

> A numeração de versões deste roadmap está alinhada às **tags do git** e ao
> [Versionamento Semântico](https://semver.org/lang/pt-BR/). O histórico
> detalhado de cada release vive em [CHANGELOG.md](CHANGELOG.md).

## Histórico de releases

### v1.0.0 (01/09/2023) — Lançada :rocket:

Objetivo: ajudar usuários a encontrar vagas de forma mais eficiente,
economizando tempo e eliminando duplicatas.

- [x] Busca automática de vagas em site específico.
- [x] Detecção de vagas duplicadas.
- [x] Envio de vagas para um canal do Discord.
- [x] Lógica para evitar envio de vagas repetidas.
- [x] Intervalos de busca personalizáveis.

### v1.1.0 (13/12/2023) — Lançada :rocket:

- [x] Eficiência do mecanismo de busca aprimorada.
- [x] Suporte a mais sites de busca de emprego.
- [x] Melhoria na formatação das mensagens.
- [x] Biblioteca `keyring` para segurança do token e do canal do Discord.

### v1.1.1 (2023) — Lançada :rocket:

- [x] Ajustes na configuração do `keyring`.

### v2.0.0 (18/05/2026) — Lançada :rocket:

Transformação de bot de scraping para **SaaS B2C multicanal de matching de
vagas**. Detalhes completos em [CHANGELOG.md](CHANGELOG.md).

- [x] Reestruturação para monorepo e arquitetura de microsserviços.
- [x] Portal web (landing + dashboard + admin).
- [x] Bot de WhatsApp com grupo de vagas e gestão de VIP.
- [x] Integração com banco de dados (Supabase: Postgres, Auth, Edge, Storage).
- [x] Autenticação e autorização (JWT/PKCE, RLS).
- [x] Armazenamento seguro de senhas.
- [x] Pagamentos via Stripe (planos free / pro / plus).
- [x] Motor de matching por área de atuação e senioridade.
- [x] Busca em 15+ sites de emprego.
- [x] `message-formatting-core` desacoplando bots da fonte de dados.

## Em desenvolvimento

### v3.0.0 — Multiplataforma e robustez :hammer:

Tema central: levar a distribuição de vagas para novos canais e endurecer a
operação. Prioriza alto impacto com baixo custo de banco de dados.

- **Novos canais**:
  - [ ] Integração com Telegram (canal de distribuição de vagas).
  - [ ] Reativar e polir o bot de Discord.
- **Robustez e qualidade**:
  - [ ] Observabilidade em produção (Sentry no web + Edge Functions).
  - [ ] Cobertura de testes (Vitest) de `useAuth` e composables do portal.
  - [ ] E2E (Playwright) dos cenários de autenticação.
  - [ ] Novas engines de scraping e melhorias nos cards de vaga.
- **Filtros**:
  - [ ] Filtros avançados de busca (slash commands / comandos de bot).

## Visão de longo prazo

Ideias planejadas, sem versão fixa — serão promovidas a releases concretos
conforme o alinhamento de produto. Quando um item virar trabalho real, abrir
um ADR em `docs/vault/12-decisions/` ou uma issue em `docs/vault/13-issues/`.

### Expansão geográfica e idiomas

- [ ] Ampliação na busca de vagas para outros países.
- [ ] Suporte a múltiplos idiomas.

### Comunicação e personalização

- [ ] Suporte a mais plataformas (Slack, Microsoft Teams, SMS, Messenger).
- [ ] Sistema de feedback para aprimorar recomendações.
- [ ] Recomendação de vagas com base no perfil do usuário.

### Inteligência de dados

- [ ] Integração com IA para recomendações personalizadas.
- [ ] Dashboard interativo de análise do mercado.

```text
- Distribuição salarial por linguagem.
- Correlação entre regime de trabalho e salário.
- Soft skills mais procuradas por local/estado.
- Demanda por linguagem por estado/país.
- Linguagens e soft skills mais requisitadas por nível de experiência.
- Comparação entre estados (salários, soft skills, métricas).
- Nuvem de palavras das descrições das vagas.
- Análise de sentimento do tom das descrições.
```

### Conteúdo e carreira

- [ ] Criação de artes com dados da vaga para redes sociais.
- [ ] Website institucional do projeto.
- [ ] Integração com ferramentas de edição de currículo.
- [ ] Otimização de currículo com base nos dados coletados.
- [ ] Sugestão de conteúdo para aprimoramento profissional.
- [ ] Preparação para entrevistas (simulações, perguntas, dicas).
- [ ] Mentoria e networking.
- [ ] Curadoria de conteúdo educacional gratuito.
- [ ] Desafios, simulados e testes de personalidade/aptidão.
- [ ] Plano de desenvolvimento individual com lembretes e progresso.
- [ ] Fórum / comunidade online entre usuários.

### Análise preditiva

- [ ] Aprendizado de máquina para prever tendências do mercado.
- [ ] Previsão de demanda por habilidades e profissões.
- [ ] Sugestão de cursos e certificações com base nas previsões.
- [ ] Recomendação de carreira por perfil + tendências.

### Mercado freelancer e segurança

- [ ] Integração de busca por projetos freelancer.
- [ ] Detecção de fraudes com aprendizado de máquina.

### Aplicativo móvel e experiências imersivas

- [ ] App móvel com busca por voz e por imagem.
- [ ] Sistema de "match" entre candidatos e empresas/clientes.
- [ ] Entrevistas e simulações em realidade virtual.
- [ ] Cursos e treinamentos em realidade aumentada.

### Integração com redes sociais

- [ ] Login e compartilhamento via redes sociais.
- [ ] Análise de perfil social para recomendações.
