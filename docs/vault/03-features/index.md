---
title: Features
tags: [feature, moc]
---

# Features

## Plano Plus (R$ 10/mês) — diferenciação em curso

Roadmap de 12 funcionalidades exclusivas (ver [[../12-decisions/ADR-010-plans-differentiation-strategy]]):

| #  | Feature                                              | Status        | Release    |
| -- | ---------------------------------------------------- | ------------- | ---------- |
| 1  | [[plus-stack-compatibility\|✓/✗ stacks compatíveis na DM]] | ✅ live    | v3.7.0     |
| 2  | DM privada filtrada por stack                        | ✅ pré-existente | —       |
| 3  | Match score 0–100                                    | ✅ pré-existente | —       |
| 4  | [[plus-resume-upload\|Upload de currículo + parse]]  | ✅ live       | v3.8.0     |
| 5  | [[plus-resume-match-breakdown\|Match breakdown estruturado]] | ✅ live | v3.8.1   |
| 6  | Histórico de candidaturas + lembrete 7d              | 🔜 próximo    | —          |
| 7  | Estatísticas pessoais detalhadas                     | 🔜            | —          |
| 8  | Alertas em tempo real (match alto)                   | 🔜            | —          |
| 9  | Filtros avançados no dashboard                       | 🔜            | —          |
| 10 | Sugestões de melhoria do CV (determinístico)         | 🔜            | —          |
| 11 | Consultoria LinkedIn (conteúdo estático)             | 🔜            | —          |
| 12 | Templates de contato (recrutador + email)            | 🔜            | —          |

## Plano Pro (R$ 5/mês)

| Feature                                                       | Status   |
| ------------------------------------------------------------- | -------- |
| Grupo WhatsApp Pro (vagas filtradas por estado + work_model)  | 🔜       |
| Dashboard de vagas no portal                                  | 🔜       |
| Newsletter semanal top 10 do stack                            | 🔜       |
| Perfil de busca completo                                      | ✅ live  |
| 3 edições do perfil por mês                                   | ✅ live  |
| Filtro de localidade + tipo de contratação                    | 🔜       |
| Suporte priorizado WhatsApp                                   | 🔜       |
| Sistema de indicação (1 mês grátis por amigo Pro+)            | 🔜       |
| Histórico de 90 dias de vagas                                 | 🔜       |

## Plano Free — funil de aquisição

| Feature                                                       | Status   |
| ------------------------------------------------------------- | -------- |
| Grupo WhatsApp público (todas as vagas)                       | ✅ live  |
| AdSense no portal                                             | ✅ live (v3.6.1) |
| [[free-to-plus-upsell\|Upsell automático Free → Plus]]        | ✅ live (v3.7.1) |
| Página `/vagas` indexável (SEO)                               | 🔜       |
| Newsletter semanal top 5                                      | 🔜       |
| Perfil simplificado (1 stack + estado)                        | 🔜       |
| Reações em vagas (👍/👎/⭐)                                    | 🔜       |
| Compartilhar vaga via WhatsApp                                | 🔜       |
| Favoritos (limite 10)                                         | 🔜       |
| Web push opcional                                             | 🔜       |

## Features transversais (todas as áreas)

| Feature                          | Notas                                |
| -------------------------------- | ------------------------------------ |
| Onboarding/cadastro              | (a criar nota)                       |
| Checkout Stripe                  | (a criar nota)                       |
| Dashboard de vagas               | (a criar nota)                       |
| Gestão de assinatura             | (a criar nota)                       |
| Admin: gestão de subscribers     | (a criar nota)                       |
| Admin: novo cliente manual       | (a criar nota)                       |
| Admin: gestão de admins          | (a criar nota)                       |

## Convenção

Cada nota de feature segue: **Contexto → User flow → Componentes envolvidos → Estados → Edge cases → Referências**.
