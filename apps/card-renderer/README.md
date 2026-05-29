# sonnar-card-renderer

Vercel Edge Function que renderiza os cards 1080x1080 das vagas do Sonnar via [`@vercel/og`](https://vercel.com/docs/og-image-generation) (Satori).

Substitui o processo `sonnar-wa-formatter` que rodava na VPS com `@napi-rs/canvas` (-1 PM2, -600MB de teto de RAM, -CPU de rasterização). Faz parte do roteiro do [ADR-006 — Redução de carga na VPS](../../docs/vault/12-decisions/ADR-006-vps-load-reduction-target.md).

## Endpoint

```
GET /api/card?token=<HMAC>&data=<base64url-json>
```

Devolve `image/png` 1080x1080 com `Cache-Control: immutable` (HIT global na CDN da Vercel a partir da 2ª chamada com a mesma URL).

### Parâmetros

- `data` — JSON da vaga (`title`, `company`, `location`, `mode`, `salary`, `tags`, `source`, `date`, `time`) serializado e encodado em **base64url**.
- `token` — HMAC-SHA256 de `data` usando `CARD_RENDERER_SECRET` (env var). Impede que terceiros gerem cards arbitrários.

### Resposta

- `200` — PNG 1080x1080.
- `401` — token ausente ou inválido.
- `400` — `data` ausente/malformado.
- `500` — erro interno.

## Variáveis de ambiente

| Var | Onde | Para que |
| --- | --- | --- |
| `CARD_RENDERER_SECRET` | Vercel (Production) | Segredo do HMAC. Mesmo valor configurado no `sender` (VPS) como `CARD_RENDERER_SECRET`. |

## Desenvolvimento local

```bash
cd apps/card-renderer
npm install
npm run dev          # vercel dev — porta 3000
```

Teste manual:

```bash
node scripts/sign.js '{"title":"Senior Backend","company":"Acme","location":"Sao Paulo - SP","mode":"REMOTO","uf":"SP","salary":"R$ 12k","tags":["Node.js","AWS"],"source":"via LinkedIn","date":"28/05/2026","time":"14:30"}'
# imprime a URL pronta — abre no browser
```

## Deploy

```bash
npm run deploy       # vercel --prod
```

DNS: configurar `cards.sonnarjobs.com.br` como CNAME apontando pra `cname.vercel-dns.com` no painel da Hostinger. Adicionar o domínio em **Project Settings → Domains** no Vercel.

## Estrutura

```
api/card.ts              Edge Function (handler)
lib/components/          JSX dos blocos do card
lib/extractor.ts         normalizacao dos dados (porta do extractJobDataFromEmbed)
lib/token.ts             HMAC verify
lib/fonts.ts             carrega Inter
public/fonts/*.ttf       Inter Regular/Medium/SemiBold/Bold
public/icons/pin.png     icone usado no bloco de localizacao
```

## Limites do Satori vs Canvas

Satori implementa um subset de CSS. O que muda vs o canvas antigo:

- Sem grão/textura procedural — substituído por gradient limpo.
- Sem vinheta complexa (multiplas camadas) — usa apenas o gradient principal.
- Tipografia adaptativa do titulo é por heuristica de comprimento (`font-size` decai com `title.length`) ao inves de medir caractere por caractere.

Resultado visual ~95% identico ao card antigo. Diferencas sao imperceptiveis em chat WhatsApp (1080→thumbnail).
