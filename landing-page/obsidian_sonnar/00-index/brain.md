---
title: Sonnar Second Brain — Index
tags: [index, moc, brain]
aliases: [Brain, Index, MOC, Home]
cssclasses: [brain-index]
---

# 🧠 Sonnar Second Brain

> Mapa central do conhecimento operacional do Sonnar.
> Versão atual: **v1.9.3** · Repositório: `D:\Elkys\WebSite_Sonnar` · Stack: Vue 3 + Vite 7 + Supabase Cloud

---

## Visão geral em uma frase

Plataforma Vue 3 SPA que entrega vagas de tecnologia personalizadas via WhatsApp, com **landing pública**, **dashboard do cliente** (vagas, assinatura, configurações) e **portal admin** (gestão de subscribers e admins), monetizada por planos Stripe (free / pro / plus) e servida com backend serverless no **Supabase Cloud** (Postgres + Auth + Edge Functions).

```
Browser SPA  ──HTTPS──▶  Supabase Cloud (Postgres+RLS · Auth PKCE · Edge Functions)
   │                          │
   ├── Landing pública        ├── Edge Functions (Stripe checkout/webhook)
   ├── /dashboard (cliente)   └── Trigger handle_new_user → subscribers
   └── /admin (staff)
```

Mais profundo em [[../01-architecture/system-overview]].

---

## 🗺️ Domínios

| Domínio             | MOC                                  | Resumo                                                          |
| ------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Arquitetura         | [[../01-architecture/system-overview]] | Stack, build, fluxo de dados                                    |
| Domínios de negócio | [[../02-domains/index]]              | Subscribers, planos, vagas, perfis de busca                     |
| Features            | [[../03-features/index]]             | Onboarding, checkout Stripe, dashboard, admin de subscribers    |
| Fluxos              | [[../04-flows/index]]                | Auth, signup, pós-Stripe, expiração de sessão                   |
| Banco de dados      | [[../05-database/index]]             | `subscribers`, `user_roles`, triggers, RLS                      |
| API / Edge          | [[../06-api/index]]                  | `create-checkout-session`, `stripe-webhook`, `create-owner-account` |
| Frontend            | [[../07-frontend/index]]             | Routing, useAuth, design tokens, Ant Design                     |
| Backend             | [[../08-backend/index]]              | Edge Functions Deno, RLS, triggers                              |
| Infra               | [[../09-infra/index]]                | Hospedagem, GitHub Actions, Stripe + Resend                     |
| Segurança           | [[../10-security/auth-model]]        | PKCE, RLS, session expiry, role check                           |
| Performance         | [[../11-performance/index]]          | Bundle, lazy loading, manualChunks                              |
| Decisões (ADR)      | [[../12-decisions/index]]            | Auth hardening, intended route, route meta                      |
| Issues / débito     | [[../13-issues/index]]               | Achados HIGH/MEDIUM/LOW                                         |
| Roadmap             | [[../14-roadmap/index]]              | Próximas ondas                                                  |
| Glossário           | [[../15-glossary/index]]             | Termos do domínio                                               |

---

## ⚡ Atalhos críticos

- 🎯 **Onboarding novo dev:** [[../01-architecture/system-overview]] → [[../07-frontend/routing]] → [[../12-decisions/index]]
- 🔐 **Mexer em auth/permissões:** [[../04-flows/auth-flow]] + [[../10-security/auth-model]]
- 💰 **Mexer em Stripe/checkout:** [[../06-api/index]] + [[../04-flows/index|fluxo pós-Stripe]]
- 🐛 **Achar bugs estruturais:** [[../13-issues/index]]

---

## 🌐 Grafo

Para a visão de grafo completa, abra `Graph view` (Ctrl+G no Obsidian). Núcleos esperados:

- `useAuth` (singleton de estado de sessão)
- `globalAuthGuard` (controle de acesso por rota)
- `subscribers` (entidade central do domínio de assinatura)
- `supabase` (data layer)
- `stripe-webhook` (sincronização de status)

---

## 📋 Convenções deste Brain

- **Toda nota** segue a estrutura: `Contexto → Descrição Técnica → Problemas → Impacto → Recomendações → Relações → Referências`.
- **Wikilinks `[[...]]` sempre que possível** — evite citar entidade sem linkar.
- **Hipóteses inferidas** são marcadas com `⚠️ Assumido` no parágrafo.
- **Referências de código** no formato `arquivo:linha`.
- **Severidade**: 🔴 HIGH · 🟠 MEDIUM · 🟢 LOW.
- ADRs seguem padrão `ADR-NNN-slug.md` em `12-decisions/`.
