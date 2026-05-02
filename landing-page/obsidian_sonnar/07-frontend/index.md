---
title: Frontend
tags: [frontend, moc]
---

# Frontend

| Nota              | Status         |
| ----------------- | -------------- |
| [[routing]]       | ✅ documentado |
| `composables.md`  | ⚠️ stub — `useAuth`, `useModalFocus` |
| `design-tokens.md` | ⚠️ stub — `assets/styles.css`, `antd-theme.css`, `motion.css`, `motion-sonar.css` |
| `pages.md`        | ⚠️ stub       |
| `components.md`   | ⚠️ stub — `SessionNotice`, `AppHeader`, `AppFooter`, `CookieBanner`, `WhatsAppPhoneMockup`, etc. |

## Estrutura de pastas

```
src/
├── App.vue
├── main.js
├── router/             # createWebHistory + globalAuthGuard
├── composables/        # useAuth (singleton), useModalFocus
├── guards/             # globalAuthGuard
├── pages/              # lazy-loaded por rota
│   └── dashboard/
├── components/         # reutilizáveis
├── integrations/
│   └── supabase/
├── data/               # constantes (ex.: stacks)
├── utils/              # validators puros
├── assets/             # CSS + imagens
└── composables/
```
