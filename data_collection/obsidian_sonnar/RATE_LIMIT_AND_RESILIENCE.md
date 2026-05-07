# 🛡️ Rate-limit, retry e circuit breaker

Esses três mecanismos trabalham juntos para garantir que o scraper **não seja bloqueado** pelos sites e **continue rodando** mesmo quando algo dá errado. Tudo está em `src/utils/rate_limiter.py`.

## 1. Rate-limit por domínio (Token bucket)

### O que é
Um "balde" de fichas por site. Cada request consome 1 ficha. As fichas são repostas a uma velocidade fixa (`rate_per_sec`). Se não há ficha, espera.

### Por que isso importa
Se você bate em LinkedIn 50 vezes em 1 segundo, ele banca seu IP. Se bate 1 vez a cada 2 segundos, ele nem percebe. O token bucket garante esse ritmo.

### Configuração atual

| Site | Rate (req/s) | Concorrência | Observações |
|---|---|---|---|
| linkedin.com | 0.5 | 2 | 429 medido com 8+ paralelas |
| indeed.com | 0.4 | 2 | Usa Cloudflare, mais sensível |
| jooble.org | 0.5 | 3 | |
| gupy.io | 0.7 | 3 | API pública mais permissiva |
| weworkremotely | 1.0 | 3 | RSS estático, brando |
| (default) | 0.5 | 3 | Todos os outros |

Edite `_DOMAIN_CONFIGS` em `rate_limiter.py` se um site específico precisar de outro valor.

### Adaptação automática
Quando o site responde 429 (rate-limit excedido), o limitador **reduz o rate em 50%**. Quando para de receber 429, ele aos poucos acelera de volta. É um **AIMD** (Additive Increase Multiplicative Decrease) — mesmo princípio do TCP.

## 2. Retry com backoff exponencial + jitter

### O que é
Quando um request falha com erro **temporário** (timeout, 5xx, 429), o sistema espera e tenta de novo. O tempo de espera **dobra a cada tentativa** e tem um pouco de aleatoriedade (jitter) para evitar que muitas requests se sincronizem ("manada").

### Matriz de decisão

| Status / erro | Retry? | Backoff base | Notas |
|---|---|---|---|
| 200, 201, 204, 301, 302 | ❌ | — | Sucesso/redirect, processa |
| 400 | ❌ | — | URL malformada, vai pra DLQ direto |
| 401, 403 | ❌ | — | Auth/proibido, **abre o circuit** |
| 404, 410 | ❌ | — | Vaga removida, registra |
| 408 (Request Timeout) | ✅ 3× | 2,4,8s + jitter | Servidor lento |
| 429 (Too Many Requests) | ✅ 3× | `max(Retry-After, 2,4,8s)` | Reduz rate ×0.5 |
| 5xx (500, 502, 503, 504) | ✅ 3× | 2,4,8s + jitter | Servidor com problema |
| Timeout / connection error | ✅ 3× | 2,4,8s + jitter | Rede instável |

Após **3 retries**, o request é dado como perdido e a URL conta como falha (vai pra `extraction_jobs.state='failed'`; ao 3º falha geral vai pra DLQ).

### Por que jitter
Sem jitter, todas as requests que falharam ao mesmo tempo voltam a tentar exatamente ao mesmo tempo — multiplicando o problema. Jitter (±30%) **espalha** os retries.

## 3. Circuit breaker

### O que é
Um "disjuntor elétrico" por site. Quando o site começa a errar muito, o disjuntor **abre** e **bloqueia toda nova request** por um período. Depois, **testa** com 1 request (estado `half_open`); se passar, fecha; se errar de novo, abre por mais tempo.

### Estados

```
       ┌─────────┐  taxa de erro >40% em janela 5min     ┌──────┐
       │ closed  │ ─────────────────────────────────────►│ open │
       └─────────┘                                       └──┬───┘
            ▲                                               │
            │                                               │ tempo expirou
            │ sucesso                                       ▼
            │                                       ┌────────────┐
            │       sucesso                         │ half_open  │
            └───────────────────────────────────────┤            │
                                                    └─────┬──────┘
                                                          │ erro
                                                          ▼
                                                    (volta para open
                                                     com tempo dobrado)
```

### Tempos
- 1ª abertura: 15 minutos
- 2ª: 30 minutos
- 3ª: 1 hora
- 4ª+: 2 horas (cap)

### Por que isso importa
Sem circuit breaker, se um site está fora do ar você gasta 3 retries × N URLs × tempo do timeout = horas perdendo tempo e amplificando o problema. Com circuit breaker, depois de detectar o problema, você simplesmente **para por 15min** e tenta de novo. Mais rápido recuperar, menos pressão no site.

## Como tudo se conecta

Toda request HTTP passa por essa sequência:

```
client.get(url) ────────────►  fetch(client, url)
                                       │
                                       ▼
                       ┌───────────────────────────┐
                       │ 1. Circuit aberto?        │ ── Sim ─► retorna None (skip)
                       └───────────────┬───────────┘
                                       │ Não
                                       ▼
                       ┌───────────────────────────┐
                       │ 2. Espera ficha do bucket │
                       └───────────────┬───────────┘
                                       │
                                       ▼
                       ┌───────────────────────────┐
                       │ 3. Faz a request          │
                       └───────────────┬───────────┘
                                       │
                                       ▼
                       ┌───────────────────────────┐
                       │ 4. Status 200-299?        │ ── Sim ─► registra sucesso
                       └───────────────┬───────────┘            volta resposta
                                       │ Não
                                       ▼
                       ┌───────────────────────────┐
                       │ 5. Decide retry pela      │ ── Não ─► retorna resposta
                       │    matriz (status/erro)   │            (se for 4xx fatal,
                       └───────────────┬───────────┘             registra falha)
                                       │ Sim
                                       ▼
                       ┌───────────────────────────┐
                       │ 6. Espera backoff+jitter  │
                       │    (volta ao passo 1)     │
                       └───────────────────────────┘
```

## O que você vê no dashboard

No `/admin/scraper`:
- **Card "429"**: quantos rate-limits foram recebidos no período. Acima de 0 = ajuste é necessário.
- **Card "Circuits abertos"**: deve estar em **0** em operação normal. Acima de 0 = um site está fora do ar ou banindo.
- **Tabela "Por domínio"**: rate efetivo, p50/p95 latência, retries por site.
- **Tabela "Circuit breakers"**: estado atual de cada site, tempo até reabrir.

## Quando ajustar

| Sintoma | Ação |
|---|---|
| Muito 429 num site específico | Reduza `rate_per_sec` desse domínio em `_DOMAIN_CONFIGS` |
| Circuit abrindo demais num site | Provavelmente o site mudou. Veja eventos no dashboard, investigue. |
| Coleta muito lenta, sem 429 | Aumente `rate_per_sec` cautelosamente (ex.: 0.5 → 0.7) e monitore |
| Retries esgotados frequentes | Site instável; talvez aumentar `max_retries` (mas atenção a amplificação) |

Veja também: [[OBSERVABILITY]], [[GLOSSARY]].
