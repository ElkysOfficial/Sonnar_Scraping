---
title: Performance
tags: [performance, moc]
---

# Performance

⚠️ **Stub** - auditar build atual.

## Estratégias ativas

- [[vcpu-ram-reduction-strategies]] — 🎯 catálogo completo de alavancas para atingir [[../12-decisions/ADR-006-vps-load-reduction-target|ADR-006]] (vCPU pico 73% → 50%). Inclui frentes Canvas, Scraper, Core, Multi-banco/Cache, e plano de rollout faseado.

## Bundle (último build, v1.8.0)

| Chunk           | Tamanho        | Gzip      |
| --------------- | -------------- | --------- |
| `antd-core`     | 469.65 kB      | 144.89 kB |
| `supabase`      | 167.48 kB      | 44.40 kB  |
| `vue-vendor`    | 105.96 kB      | 41.18 kB  |
| `index`         | 27.90 kB       | 9.81 kB   |
| Página maior    | `SignupPage.js` 23.75 kB | 8.61 kB |

## Notas a criar

- `bundle-strategy.md` - `manualChunks` em `vite.config.ts` e por quê.
- `lazy-loading.md` - todas as páginas lazy via `() => import(...)`.
- `antd-tree-shaking.md` - apenas componentes usados (Input, Select, DatePicker, Checkbox, Button, Divider, ConfigProvider).
- `largest-contentful-paint.md` - métrica e otimizações da landing.

## Threshold

`chunkSizeWarningLimit: 500` em `vite.config.ts`. `antd-core` está perto do teto - monitorar.
