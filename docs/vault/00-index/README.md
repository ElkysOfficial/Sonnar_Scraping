---
title: Como usar este Brain
tags: [meta]
---

# Como usar este Brain

## Abrir no Obsidian

1. **File → Open vault → Open folder as vault** → selecione `D:/Elkys/WebSite_Sonnar/obsidian/`.
2. Aguarde indexação (alguns segundos).
3. **Graph view**: `Ctrl+G` - visualize núcleos centrais (`useAuth`, `globalAuthGuard`, `subscribers`, `Stripe webhook`).

## Pontos de entrada

- 🧠 [[brain]] - mapa central de tudo.
- 🗺️ MOCs por área: [[../01-architecture/system-overview]], [[../02-domains/index]], [[../03-features/index]], [[../04-flows/index]], [[../05-database/index]], [[../06-api/index]], [[../07-frontend/index]], [[../08-backend/index]], [[../09-infra/index]], [[../10-security/index]], [[../11-performance/index]], [[../12-decisions/index]], [[../13-issues/index]], [[../14-roadmap/index]], [[../15-glossary/index]].

## Convenções

- **Wikilinks** `[[...]]` em todo lugar - clique para navegar.
- **Severidade** em issues: 🔴 HIGH · 🟠 MEDIUM · 🟢 LOW.
- **`⚠️ Assumido`** marca hipóteses ainda não validadas no código (boas candidatas a confirmar antes de agir).
- **Frontmatter** com `tags` ajuda a filtrar (ex: tag `adr`, `flow`, `issue`, `domain`).
- Toda nota técnica segue: **Contexto → Descrição Técnica → Problemas → Impacto → Recomendações → Relações → Referências**.
- ADRs seguem: **Contexto → Decisão → Alternativas → Consequências**.

## Manutenção

- Novo ADR? Adicione em `12-decisions/` no formato `ADR-NNN-slug.md` e linke em `12-decisions/index.md`.
- Issue resolvida? Marque status no frontmatter como `resolved` e mova para `13-issues/_resolved/`.
- Mudança grande de arquitetura? Atualize [[../01-architecture/system-overview]] + ADR novo.
- Sempre atualize **Referências** (`arquivo:linha`) quando mudar caminho de arquivo no código.

## Não confundir

- `obsidian/` (este diretório) - vault de conhecimento humano-legível, versionado no Git.
- `obsidian/.obsidian/` - config local do Obsidian por dev (gitignored).
- `docs/` - caso exista no futuro, deve conter docs canônicos versionados (source of truth). Este Brain expande esses docs com análise, links e diagnóstico.

## Agentes para enriquecer

- `/review` - review de PR.
- `/security-review` - review de segurança da branch.
- Use `Agent` (Explore) para responder "onde está X" sem poluir contexto.
