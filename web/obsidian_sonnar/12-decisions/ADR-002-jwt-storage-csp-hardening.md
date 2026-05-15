---
title: ADR-002 - JWT storage em localStorage, mitigado por CSP estrita
tags: [adr, security, auth]
status: accepted
release: v1.9.0
---

# ADR-002 - JWT em localStorage com CSP estrita

## Contexto

A autenticação Supabase em SPA armazena `access_token` e `refresh_token` em `localStorage` por padrão (configurado em `src/integrations/supabase/client.ts`). Auditoria classificou isso como 🔴 HIGH em [[../13-issues/jwt-localstorage-xss]] porque qualquer XSS exfiltra a sessão completa.

Decisão: **manter localStorage** mas reduzir a superfície de XSS com CSP estrita + headers HTTP de hardening, em vez de migrar para cookies HttpOnly via BFF.

## Decisão

### 1. CSP estrita via `<meta>` em `index.html`

```
default-src 'self';
script-src 'self' 'sha256-iAgw…' 'sha256-YH0t…';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

Pontos cruciais:
- **Sem `'unsafe-inline'` em `script-src`.** Inline scripts permitidos são apenas os 2 blocos JSON-LD do SEO, identificados por hash sha256 (qualquer alteração no conteúdo invalida o hash e quebra o build até atualizar - fail-closed).
- **Sem `'unsafe-eval'`.** Bloqueia `eval()`, `new Function()`, `setTimeout(string)`.
- **`connect-src` whitelistado.** Mesmo que JS arbitrário rode, ele não consegue `fetch()` para `attacker.com` exfiltrar o token.
- **`frame-src` apenas Stripe.** Bloqueia clickjacking via iframe externo (combinado com `X-Frame-Options: DENY` em headers HTTP).

### 2. Headers HTTP em `.htaccess`

Adicionados em `public/.htaccess`:

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=(), interest-cohort=()"
Header always set Cross-Origin-Opener-Policy "same-origin"
Header always set Cross-Origin-Resource-Policy "same-site"
Header always set X-XSS-Protection "0"
```

Mantidos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 3. Auditoria periódica

Issue [[../13-issues/jwt-localstorage-xss]] documenta os gatilhos para reavaliar a decisão (UGC, auditoria externa, escala paga, bug detectado).

## Alternativas consideradas

| Opção                                                | Por que não (agora)                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Migrar para cookies HttpOnly + BFF**               | Requer Edge Function ou serviço de auth-proxy + reescrita do data layer. Semanas de engenharia, novo ponto de falha. Reavaliar nos gatilhos definidos em [[../13-issues/jwt-localstorage-xss]]. |
| **Migrar pra Nuxt SSR**                              | Mesma magnitude da mudança acima + repensar todo o roteamento e bundle. Não justificado pelo ROI atual.            |
| **`storage: undefined` (sessão em memória)**          | UX inaceitável: refresh força re-login.                                                                            |
| **`'unsafe-inline'` em `script-src`**                | Anula 80% do valor da CSP. JSON-LD via hash é mais seguro.                                                         |
| **`Content-Security-Policy-Report-Only` direto**     | Sem report endpoint, é só ruído no console. Adicionar quando tivermos coleta. Por ora, **enforcing** já com whitelist conservadora. |
| **CSP via `.htaccess` em vez de `<meta>`**           | Meta funciona em dev (Vite preview) e em qualquer hosting. .htaccess só funciona em Apache. Manter no `<meta>` evita drift. |
| **JSON-LD em arquivo externo**                       | Cripta o SEO no first paint. Hash é mais simples e tem mesmo nível de segurança.                                   |

## Consequências

### Positivas

- **Token continua roubável apenas se o atacante encontrar um vetor de XSS** _e_ **conseguir exfiltrar via canal permitido pelo CSP** - combinação muito mais difícil que XSS isolado.
- **Defesa em profundidade.** Mesmo que ataque consiga executar JS, não consegue contactar `attacker.com`.
- **Custo zero de runtime.** CSP é avaliada pelo browser; não há overhead.
- **Sinaliza maturidade** em auditorias de segurança e processos LGPD.

### Negativas / atenção

- **Mudar JSON-LD em `index.html` exige recalcular hashes.** Documentado em [[../13-issues/jwt-localstorage-xss|issue note]] e em comentário no próprio `index.html`. Pode quebrar release silenciosamente se esquecido - mitigação: incluir verificação de hashes em CI.
- **`'unsafe-inline'` em `style-src` permanece.** Vue 3 + Vite injetam style attributes em runtime; impacto de XSS via CSS é baixo, mas não-zero. Trusted Types resolveria; ainda não é viável em Vue 3.
- **Stripe pode introduzir novos subdomínios.** Se Stripe atualizar e adicionar (ex.: `m.stripe.network`), CSP precisa ser atualizada. Monitorar via [Stripe CSP docs](https://stripe.com/docs/security/guide#content-security-policy).
- **HSTS 1 ano + includeSubDomains.** Decisão **irreversível** por 1 ano por subdomínio. Confirmar que todos os subdomínios servem HTTPS antes de manter.

## Mantido sem mudança

- `localStorage` como storage do Supabase Auth (config em `src/integrations/supabase/client.ts`).
- Inactivity timeout 30 min ([[ADR-001-auth-hardening]]).
- RLS no Postgres como fronteira de segurança real (papel de defesa primária permanece no banco).

## Relações

- [[../13-issues/jwt-localstorage-xss]]
- [[../10-security/auth-model]]
- [[ADR-001-auth-hardening]]

## Referências

- `index.html` (linhas com meta CSP - buscar `Content-Security-Policy`)
- `public/.htaccess`
- `src/integrations/supabase/client.ts`
- [CSP Level 3 spec](https://www.w3.org/TR/CSP3/)
- [Hash do JSON-LD calculado em build](https://www.w3.org/TR/CSP3/#match-element-to-source-list) (sha256 base64)
