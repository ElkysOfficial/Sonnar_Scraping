---
title: "SessionNotice z-index 9999 (resolvido)"
tags: [issue, ui]
severity: low
status: resolved
release: v1.9.2
last-update: 2026-05-01
---

# SessionNotice z-index 9999

## Contexto

`src/components/SessionNotice.vue` usava `z-index: 9999` (magic number) pra ficar acima de qualquer modal. Auditoria deixou aberto pra validar se conflita com modais do Ant Design Vue.

## Validação

Z-index defaults do Ant Design Vue:

| Componente   | z-index |
| ------------ | ------- |
| Affix        | 10      |
| Drawer       | 1000    |
| Modal        | 1000    |
| Notification | 1010    |
| Popover      | 1030    |
| Dropdown     | 1050    |
| Tooltip      | 1070    |
| Image preview| 1080    |

Sonnar não chama `Modal`/`Drawer`/`Notification` do Ant Design (uso filtrado em `main.js`: só `Input`, `Select`, `DatePicker`, `Checkbox`, `Button`, `Divider`, `ConfigProvider`). Conflito real é improvável - mas se algum admin form usar `<a-select>` com dropdown, o popup Ant fica em 1050, ainda **abaixo** do toast.

## Resolução (v1.9.2)

Magic number substituído pelo design token:

```css
/* src/assets/styles.css */
--z-toast: 1100;

/* src/components/SessionNotice.vue */
.sn-toast { z-index: var(--z-toast, 1100); }
```

Critério: `--z-toast` (1100) > qualquer z-index padrão do Ant Design Vue (max 1080), garantindo que avisos de sessão expirando nunca fiquem ocultos.

## Plano (longo prazo)

Se algum dia quisermos modais Sonnar próprios, eles devem usar `--z-modal` (500). O Ant Design Vue continuaria em 1000–1080 (default). Ou seja, há um gap visível entre o nosso scale e o do Ant - aceitável enquanto Ant não for substituído por DS próprio.

## Relações

- [[../../12-decisions/ADR-001-auth-hardening]]
- [[../../07-frontend/index]]

## Referências

- `src/components/SessionNotice.vue:139`
- `src/assets/styles.css:308-318`
- [Ant Design Vue z-index defaults](https://www.antdv.com/docs/vue/customize-theme)
