---
title: "Catch-all redireciona silenciosamente para `/` (resolvido)"
tags: [issue, ux, router]
severity: low
status: resolved
release: v1.9.2
last-update: 2026-05-01
---

# Catch-all silent redirect → `/`

## Contexto

Pré-v1.9.2 o router tratava qualquer URL desconhecida com:

```js
{ path: '/:pathMatch(.*)*', redirect: '/' }
```

Isso evita tela em branco, mas:

- O usuário não sabe que digitou errado - só "acordou" na home.
- Bookmarks quebrados aparentam estar funcionando (não dão erro).
- SEO crawlers veem `/foo` redirecionando pra `/` em vez de 404.
- Sem rastreabilidade pra ajustes (qual URL inexistente foi mais acessada?).

## Resolução (v1.9.2)

`src/pages/NotFoundPage.vue` (nova página minimalista, ~50 linhas de template):

```
─────────────────────────────────────
   ERRO 404
   Essa rota não existe.
   A URL pode ter sido renomeada,
   removida ou ter algum erro de digitação.
   Volte pra home e tente de novo.

   [Voltar pra home]  [Voltar pra página anterior]

   URL acessada: `/foo`
─────────────────────────────────────
```

`src/router/index.js`:

```js
{ path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundPage }
```

`src/App.vue`:

```js
const isChromeHidden = computed(() => {
  if (route.name === 'NotFound') return false  // sempre mostra header/footer na 404
  ...
})
```

Garante que o usuário tem contexto de navegação mesmo se digitar `/dashboard/foo` (path que normalmente esconderia o chrome - sobrescrito pra NotFound).

## Trade-offs aceitos

- **CTA "Voltar pra página anterior"** usa `window.history.back()`. Se não houver histórico (acesso direto via bookmark/URL), cai em `router.replace('/')`.
- **Nenhum logging server-side de 404s**. Adicionar quando observabilidade entrar (Sentry/PostHog - ver roadmap). Por ora, é browser-only.
- **Não retorna HTTP 404** - SPA estática serve sempre `index.html` (regra `RewriteRule ^ /index.html [L]` no `.htaccess`). Pra retornar 404 real, seria necessário pre-rendering ou edge function. Aceitável pra SPA.

## Relações

- [[../../07-frontend/routing]]
- [[../../11-performance/index]]

## Referências

- `src/pages/NotFoundPage.vue`
- `src/router/index.js:23,92-95`
- `src/App.vue:46-62`
