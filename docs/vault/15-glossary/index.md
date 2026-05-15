---
title: Glossário
tags: [glossary, moc]
---

# Glossário

Termos do domínio Sonnar. Linkar daqui sempre que o termo aparecer pela primeira vez em outra nota.

| Termo                  | Definição                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Subscriber**         | Usuário com linha em `subscribers`. Inclui clientes free e pagos.                                      |
| **Plan**               | Enum `'free' \| 'pro' \| 'plus'`. Determina volume e curadoria de vagas.                               |
| **Status**             | Enum `'active' \| 'pending' \| 'past_due' \| 'canceled'`. Reflete estado da assinatura no Stripe.       |
| **Owner**              | Role máximo. Acesso a `/admin/admins`. Bootstrap por `OWNER_EMAIL`.                                    |
| **Admin**              | Role staff. Acesso a `/admin/*` exceto gestão de admins.                                               |
| **Client**             | Role usuário comum. Acesso a `/dashboard/*`.                                                           |
| **Staff**              | Termo agregador: `owner` ou `admin`.                                                                   |
| **Intended route**     | Rota originalmente requisitada; preservada via `?redirect=` quando guard manda anônimo pro login.      |
| **`bootAuth`**         | Função idempotente que hidrata sessão antes do `app.mount`. Cacheia `bootPromise`.                     |
| **`globalAuthGuard`**  | `router.beforeEach` único. Único ponto de decisão de acesso por rota.                                  |
| **`roleStatus`**       | Estado reativo: `idle \| loading \| ready \| no-role \| transient-error`. Distingue erro real de transient. |
| **PKCE**               | Proof Key for Code Exchange. Fluxo OAuth2.1 obrigatório para SPA.                                      |
| **needsPayment**       | Helper do guard. `true` quando cliente tem plano pago e status ≠ `active`.                             |
| **Inactivity timeout** | 30 min sem atividade → signOut auto. Aviso aos 28 min via `session-expiring`.                          |
