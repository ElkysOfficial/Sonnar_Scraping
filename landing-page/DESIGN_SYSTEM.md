# Sonnar Design System v2.0

> Sistema visual unificado para garantir consistência absoluta entre todas as páginas e componentes.

---

## Sumário

1. [Design Tokens](#1-design-tokens)
2. [Tipografia](#2-tipografia)
3. [Cores](#3-cores)
4. [Espaçamento](#4-espaçamento)
5. [Bordas e Raios](#5-bordas-e-raios)
6. [Sombras (Elevation)](#6-sombras-elevation)
7. [Componentes Base](#7-componentes-base)
8. [Layout e Grid](#8-layout-e-grid)
9. [Animações](#9-animações)
10. [Acessibilidade](#10-acessibilidade)
11. [Regras de Consistência](#11-regras-de-consistência)
12. [Proibições](#12-proibições)

---

## 1. Design Tokens

Os tokens são variáveis CSS reutilizáveis definidas em `src/assets/styles.css`.

### Arquivos do Design System

| Arquivo | Propósito |
|---------|-----------|
| `src/assets/styles.css` | Tokens principais, componentes base, utilitários |
| `src/assets/antd-theme.css` | Customização do Ant Design |
| `tailwind.config.ts` | Configuração do Tailwind CSS |

---

## 2. Tipografia

### Fonte Principal

```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Escala Tipográfica (Fluid)

| Token | Mobile | Desktop | Uso |
|-------|--------|---------|-----|
| `--text-xs` | 11px | 12px | Labels pequenos, metadados |
| `--text-sm` | 13px | 14px | Texto secundário, captions |
| `--text-base` | 15px | 16px | Corpo de texto padrão |
| `--text-lg` | 16px | 18px | Texto destacado |
| `--text-xl` | 18px | 20px | Subtítulos pequenos |
| `--text-2xl` | 20px | 24px | H4, subtítulos |
| `--text-3xl` | 24px | 32px | H3, títulos de seção |
| `--text-4xl` | 30px | 40px | H2, títulos principais |
| `--text-5xl` | 36px | 48px | H1, hero |
| `--text-hero` | 28px | 48px | Título hero (extra fluid) |

### Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-normal` | 400 | Corpo de texto |
| `--font-medium` | 500 | Labels, ênfase leve |
| `--font-semibold` | 600 | Botões, subtítulos |
| `--font-bold` | 700 | Títulos, destaques |

### Altura de Linha

| Token | Valor | Uso |
|-------|-------|-----|
| `--lh-tight` | 1.1 | Títulos grandes |
| `--lh-title` | 1.2 | Títulos e headings |
| `--lh-body` | 1.6 | Corpo de texto |
| `--lh-relaxed` | 1.75 | Texto longo, parágrafos |

### Espaçamento entre Letras

| Token | Valor | Uso |
|-------|-------|-----|
| `--ls-tight` | -0.02em | Títulos grandes |
| `--ls-normal` | 0 | Texto padrão |
| `--ls-wide` | 0.05em | Labels uppercase |

### Hierarquia de Headings

```
H1 → --text-5xl / --font-bold / --lh-tight (ÚNICO por página)
H2 → --text-4xl / --font-bold / --lh-title
H3 → --text-3xl / --font-bold / --lh-title
H4 → --text-2xl / --font-semibold / --lh-title
H5 → --text-xl / --font-semibold / --lh-body
H6 → --text-lg / --font-medium / --lh-body
```

---

## 3. Cores

### Paleta Primária (Marca)

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-accent` | #2563EB | #3b82f6 | Cor principal da marca |
| `--color-accent-hover` | #1D4ED8 | #60a5fa | Hover em elementos primários |
| `--color-accent-active` | #1E40AF | #1e40af | Estado ativo/pressionado |
| `--color-accent-soft` | #EFF6FF | rgba(59,130,246,0.15) | Backgrounds sutis |
| `--color-accent-muted` | rgba(37,99,235,0.1) | rgba(59,130,246,0.1) | Elementos discretos |

### Cores de Status (Semânticas)

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-success` | #059669 | #10b981 | Confirmações, ações positivas |
| `--color-success-soft` | #ECFDF5 | rgba(16,185,129,0.15) | Background de sucesso |
| `--color-warning` | #D97706 | #f59e0b | Alertas, atenção |
| `--color-error` | #DC2626 | #f87171 | Erros, ações destrutivas |
| `--color-whatsapp` | #25D366 | #25D366 | Botão WhatsApp |
| `--color-whatsapp-hover` | #1EBE5A | #1EBE5A | Hover WhatsApp |

### Cores de Texto

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-text-primary` | #111827 | #f1f5f9 | Texto principal |
| `--color-text-secondary` | #4B5563 | #cbd5e1 | Texto secundário |
| `--color-text-muted` | #6B7280 | #94a3b8 | Texto desabilitado, hints |
| `--color-text-inverse` | #FFFFFF | #0f172a | Texto sobre fundos escuros |

### Cores de Background

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-background` | #FFFFFF | #0f172a | Fundo principal |
| `--color-surface` | #FAFBFC | #1e293b | Cards, seções alternadas |
| `--color-surface-elevated` | #FFFFFF | #334155 | Elementos elevados (modais) |

### Cores de Borda

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-border` | #E5E7EB | #334155 | Bordas padrão |
| `--color-border-subtle` | #F3F4F6 | #1e293b | Bordas sutis, divisores |

### Gradientes

```css
--gradient-hero: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
```

---

## 4. Espaçamento

### Escala Base (4px)

| Token | Valor | Pixels |
|-------|-------|--------|
| `--space-1` | 0.25rem | 4px |
| `--space-2` | 0.5rem | 8px |
| `--space-3` | 0.75rem | 12px |
| `--space-4` | 1rem | 16px |
| `--space-5` | 1.25rem | 20px |
| `--space-6` | 1.5rem | 24px |
| `--space-7` | 1.75rem | 28px |
| `--space-8` | 2rem | 32px |
| `--space-9` | 2.25rem | 36px |
| `--space-10` | 2.5rem | 40px |
| `--space-11` | 2.75rem | 44px |
| `--space-12` | 3rem | 48px |
| `--space-16` | 4rem | 64px |
| `--space-20` | 5rem | 80px |
| `--space-24` | 6rem | 96px |

### Espaçamento de Seções (Fluid)

| Token | Mobile | Desktop | Uso |
|-------|--------|---------|-----|
| `--section-padding-y` | 48px | 80px | Padding vertical de seções |
| `--section-gap` | 32px | 64px | Gap entre elementos de seção |

### Regras de Uso

- **Padding interno de cards**: `--card-padding` (clamp 20-32px)
- **Gap entre cards**: `--grid-gap` (24px) ou `--grid-gap-sm` (16px)
- **Margin entre form-groups**: `--space-5` (20px)
- **Gap em botões/inputs inline**: `--space-2` ou `--space-3`

---

## 5. Bordas e Raios

### Border Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 4px | Badges, chips pequenos |
| `--radius-md` | 8px | Botões, inputs |
| `--radius-lg` | 12px | Cards pequenos |
| `--radius-xl` | 16px | Cards, modais |
| `--radius-2xl` | 24px | Cards grandes, hero sections |
| `--radius-full` | 9999px | Pills, avatares, badges |

### Aliases

```css
--radius-card: var(--radius-xl);    /* 16px */
--radius-button: var(--radius-md);   /* 8px */
--radius-input: var(--radius-md);    /* 8px */
```

### Espessura de Bordas

| Espessura | Valor | Uso |
|-----------|-------|-----|
| Hairline | 1px | Bordas padrão de inputs, cards |
| Default | 1px | Uso geral |
| Strong | 2px | Focus rings, estados ativos |

---

## 6. Sombras (Elevation)

### Light Theme

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | 0 1px 2px rgba(0,0,0,0.05) | Cards em repouso |
| `--shadow-md` | 0 4px 12px rgba(0,0,0,0.08) | Cards em hover, dropdowns |
| `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.12) | Modais, popovers |
| `--shadow-xl` | 0 16px 48px rgba(0,0,0,0.16) | Elementos flutuantes prioritários |

### Dark Theme

| Token | Valor |
|-------|-------|
| `--shadow-sm` | 0 1px 2px rgba(0,0,0,0.3) |
| `--shadow-md` | 0 4px 12px rgba(0,0,0,0.4) |
| `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.5) |
| `--shadow-xl` | 0 16px 48px rgba(0,0,0,0.6) |

### Focus Ring

```css
--focus-ring: 0 0 0 3px var(--color-accent-soft);
```

---

## 7. Componentes Base

### Botões

#### Variantes

| Classe | Uso |
|--------|-----|
| `.btn-primary` | Ação principal (CTA) |
| `.btn-secondary` | Ação secundária |
| `.btn-ghost` | Ação terciária, transparente |
| `.btn-danger` | Ações destrutivas (deletar, cancelar) |
| `.btn-outline-primary` | Primário com borda |
| `.btn-outline-danger` | Perigo com borda |
| `.btn-whatsapp` | Botão WhatsApp |
| `.btn-icon` | Botão apenas com ícone |

#### Tamanhos

| Classe | Altura | Uso |
|--------|--------|-----|
| `.btn-sm` | 36px | Ações compactas |
| `.btn` (default) | 44px | Padrão |
| `.btn-lg` | 48px | CTAs destacados |

#### Estados

- **Default**: Cor base
- **Hover**: Cor mais escura, leve elevação (`transform: translateY(-1px)`)
- **Active**: Volta à posição original
- **Focus**: Ring de foco (`--focus-ring`)
- **Disabled**: `opacity: 0.5`, `cursor: not-allowed` (classe `.is-disabled` ou `:disabled`)
- **Loading**: Classe `.is-loading` com spinner

#### Estrutura CSS

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--control-padding-x);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  border-radius: var(--radius-button);
  min-height: var(--control-height-md);  /* 44px touch target */
  transition: all var(--transition-fast);
}
```

#### Exemplo de Uso

```html
<!-- Botão primário -->
<button class="btn btn-primary">Salvar</button>

<!-- Botão com loading -->
<button class="btn btn-primary is-loading">Salvando...</button>

<!-- Botão de perigo -->
<button class="btn btn-danger">Deletar</button>

<!-- Botão ghost -->
<button class="btn btn-ghost">Cancelar</button>

<!-- Botão apenas ícone -->
<button class="btn btn-icon btn-ghost">
  <svg>...</svg>
</button>
```

---

### Inputs

#### Variantes

| Classe | Uso |
|--------|-----|
| `.form-input` | Text inputs |
| `.form-select` | Dropdowns/selects |
| `.form-textarea` | Áreas de texto |

#### Tamanhos de Controle

| Token | Valor | Uso |
|-------|-------|-----|
| `--control-height-sm` | 36px | Inputs compactos |
| `--control-height-md` | 44px | Padrão |
| `--control-height-lg` | 48px | Touch devices |

#### Estados

- **Default**: Borda `--color-border`
- **Focus**: Borda `--color-accent` + `--focus-ring`
- **Error**: Borda `--color-error`
- **Disabled**: `opacity: 0.5`, `cursor: not-allowed`

#### Estrutura do Form Group

```html
<div class="form-group">
  <label class="form-label">Label</label>
  <input class="form-input" type="text">
  <span class="form-helper">Texto de ajuda opcional</span>
  <span class="form-error-message">Mensagem de erro</span>
</div>
```

#### Classes de Estado

| Classe | Uso |
|--------|-----|
| `.is-error` | Input com erro de validação |
| `.is-success` | Input validado com sucesso |
| `:disabled` | Input desabilitado |

---

### Checkbox, Radio e Switch

#### Checkbox

```html
<label class="form-checkbox">
  <input type="checkbox">
  <span class="form-checkbox-label">Aceito os termos</span>
</label>
```

#### Radio

```html
<label class="form-radio">
  <input type="radio" name="opcao">
  <span class="form-radio-label">Opção A</span>
</label>
```

#### Switch/Toggle

```html
<label class="form-switch">
  <input type="checkbox" class="form-switch-input">
  <span class="form-switch-label">Ativar notificações</span>
</label>
```

---

### Cards

#### Estrutura Base

```css
.card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);      /* 16px */
  padding: var(--card-padding);           /* 20-32px fluid */
  transition: box-shadow var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-md);
}
```

#### Variações

- **Card padrão**: Fundo branco, borda sutil
- **Card elevado**: Com `--shadow-md` por padrão
- **Card interativo**: Hover com sombra e leve transformação

---

### Badges / Tags

#### Por Plano

| Classe | Cor | Uso |
|--------|-----|-----|
| `.badge-pro` | Azul | Plano Pro |
| `.badge-plus` | Roxo | Plano Plus |
| `.badge-free` | Cinza | Plano Free |

#### Por Status

| Classe | Cor | Uso |
|--------|-----|-----|
| `.badge-active` | Verde | Ativo |
| `.badge-pending` | Amarelo | Pendente |
| `.badge-canceled` | Vermelho | Cancelado |
| `.badge-inactive` | Cinza | Inativo |

#### Estrutura

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
```

---

### Alerts

#### Classes Nativas

```html
<div class="alert alert-info">
  <div class="alert-icon"><!-- ícone --></div>
  <div class="alert-content">
    <div class="alert-title">Informação</div>
    <div class="alert-description">Descrição opcional</div>
  </div>
</div>
```

| Classe | Cor | Uso |
|--------|-----|-----|
| `.alert-info` | Azul | Informações gerais |
| `.alert-success` | Verde | Confirmações |
| `.alert-warning` | Amarelo | Alertas |
| `.alert-error` | Vermelho | Erros |

#### Com Ant Design

```html
<a-alert type="success" message="Sucesso!" />
```

---

### Toast Notifications

```html
<div class="toast-container">
  <div class="toast toast-success">
    Operação realizada com sucesso!
  </div>
</div>
```

| Classe | Uso |
|--------|-----|
| `.toast-success` | Confirmação |
| `.toast-error` | Erro |
| `.toast-warning` | Alerta |
| `.toast-info` | Informação |

---

### Dropdown Menu

```html
<div class="dropdown">
  <button class="btn btn-secondary">Menu</button>
  <div class="dropdown-menu">
    <button class="dropdown-item">Editar</button>
    <button class="dropdown-item">Duplicar</button>
    <div class="dropdown-divider"></div>
    <button class="dropdown-item is-danger">Excluir</button>
  </div>
</div>
```

#### Classes

| Classe | Uso |
|--------|-----|
| `.dropdown-menu` | Container do menu |
| `.dropdown-menu-right` | Alinha à direita |
| `.dropdown-item` | Item do menu |
| `.dropdown-item.is-danger` | Item destrutivo (vermelho) |
| `.dropdown-divider` | Separador |
| `.is-open` | Estado aberto |

---

### Modais

- **Backdrop**: `--z-modal-backdrop` (400)
- **Modal**: `--z-modal` (500)
- **Border Radius**: `--radius-xl`
- **Padding**: `--card-padding-lg`
- **Sombra**: `--shadow-lg`

---

### Tabelas

Estrutura responsiva com cards em mobile:

```css
/* Desktop: Tabela tradicional */
@media (min-width: 769px) {
  .subscribers-table-wrapper { display: block; }
  .subscribers-cards { display: none; }
}

/* Mobile: Cards */
@media (max-width: 768px) {
  .subscribers-table-wrapper { display: none; }
  .subscribers-cards { display: flex; flex-direction: column; }
}
```

---

### Pagination

```html
<nav class="pagination">
  <button class="pagination-item" disabled>&lt;</button>
  <button class="pagination-item is-active">1</button>
  <button class="pagination-item">2</button>
  <button class="pagination-item">3</button>
  <span class="pagination-ellipsis">...</span>
  <button class="pagination-item">10</button>
  <button class="pagination-item">&gt;</button>
</nav>
```

---

### Loading States

#### Spinner

```html
<div class="spinner"></div>
<div class="spinner spinner-sm"></div>
<div class="spinner spinner-lg"></div>
```

#### Skeleton Loaders

```html
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-avatar"></div>
<div class="skeleton skeleton-button"></div>
<div class="skeleton skeleton-card"></div>
```

#### Loading Overlay

```html
<div class="loading-overlay">
  <div class="spinner spinner-lg"></div>
</div>
```

---

### Progress Bar

```html
<div class="progress">
  <div class="progress-bar" style="width: 60%"></div>
</div>

<!-- Variantes -->
<div class="progress">
  <div class="progress-bar progress-bar-success" style="width: 100%"></div>
</div>
```

| Classe | Cor |
|--------|-----|
| `.progress-bar` | Azul (padrão) |
| `.progress-bar-success` | Verde |
| `.progress-bar-warning` | Amarelo |
| `.progress-bar-error` | Vermelho |

---

### Avatar

```html
<div class="avatar">AB</div>
<div class="avatar"><img src="..." alt=""></div>
```

| Classe | Tamanho |
|--------|---------|
| `.avatar-sm` | 32px |
| `.avatar` | 40px |
| `.avatar-lg` | 48px |
| `.avatar-xl` | 64px |

#### Avatar Group

```html
<div class="avatar-group">
  <div class="avatar">A</div>
  <div class="avatar">B</div>
  <div class="avatar">C</div>
</div>
```

---

### Tooltip

```html
<span class="tooltip">
  Hover me
  <span class="tooltip-content">Texto do tooltip</span>
</span>
```

---

### Divider

```html
<div class="divider"></div>

<!-- Com texto -->
<div class="divider-text">ou</div>

<!-- Vertical -->
<div class="divider-vertical"></div>
```

---

### Empty State

```html
<div class="empty-state">
  <div class="empty-state-icon"><!-- ícone --></div>
  <h3 class="empty-state-title">Nenhum item encontrado</h3>
  <p class="empty-state-description">Adicione seu primeiro item para começar.</p>
  <button class="btn btn-primary">Adicionar Item</button>
</div>
```

---

## 8. Layout e Grid

### Container

| Token | Valor | Uso |
|-------|-------|-----|
| `--container-max` | 1120px | Container padrão |
| `--container-wide` | 1200px | Seções amplas |
| `--container-narrow` | 800px | Forms, pricing |
| `--container-text` | 672px | Texto longo |
| `--container-padding` | 16-24px | Padding lateral fluid |

### Classes de Container

```css
.container { max-width: var(--container-max); }
.container-narrow { max-width: var(--container-narrow); }
.container-text { max-width: var(--container-text); }
```

### Grid System

- **Colunas**: Usar CSS Grid ou Flexbox
- **Gap padrão**: `--grid-gap` (24px)
- **Gap compacto**: `--grid-gap-sm` (16px)

### Estrutura de Página

```
┌─────────────────────────────────────┐
│           AppHeader (fixed)          │
├─────────────────────────────────────┤
│                                     │
│           <main>                    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │    Section (padding-y)       │   │
│  │  ┌───────────────────────┐  │   │
│  │  │    Container          │  │   │
│  │  │  ┌─────────────────┐  │  │   │
│  │  │  │  Section Header │  │  │   │
│  │  │  ├─────────────────┤  │  │   │
│  │  │  │    Content      │  │  │   │
│  │  │  └─────────────────┘  │  │   │
│  │  └───────────────────────┘  │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│            AppFooter                 │
└─────────────────────────────────────┘
```

### Breakpoints

| Nome | Valor | Uso |
|------|-------|-----|
| Mobile | < 640px | Layout single column |
| Tablet | 640px - 1024px | Layout 2 colunas |
| Desktop | > 1024px | Layout completo |

---

## 9. Animações

### Durações

| Token | Valor | Uso |
|-------|-------|-----|
| `--animation-fast` | 200ms | Hovers, feedback imediato |
| `--animation-base` | 400ms | Transições padrão |
| `--animation-slow` | 600ms | Entradas de elementos |
| `--animation-slower` | 800ms | Animações elaboradas |

### Transições

| Token | Valor | Uso |
|-------|-------|-----|
| `--transition-fast` | 150ms ease | Hovers, estados |
| `--transition-base` | 200ms ease | Transições gerais |
| `--transition-slow` | 300ms ease | Mudanças de layout |

### Classes de Animação

| Classe | Efeito |
|--------|--------|
| `.animate-fade-in` | Fade in |
| `.animate-fade-in-up` | Fade in + slide up |
| `.animate-fade-in-down` | Fade in + slide down |
| `.animate-fade-in-left` | Fade in + slide left |
| `.animate-fade-in-right` | Fade in + slide right |
| `.animate-scale-in` | Fade in + scale |
| `.animate-float` | Flutuação contínua |
| `.animate-pulse-soft` | Pulse suave |

### Stagger (Delay Escalonado)

```css
.stagger-1 { animation-delay: 0ms; }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 200ms; }
.stagger-4 { animation-delay: 300ms; }
.stagger-5 { animation-delay: 400ms; }
.stagger-6 { animation-delay: 500ms; }
```

---

## 10. Acessibilidade

### Contraste

- **WCAG AA mínimo**: 4.5:1 para texto normal
- **WCAG AA mínimo**: 3:1 para texto grande (18px+ ou 14px bold)
- Todas as cores de texto sobre backgrounds atendem WCAG AA

### Estados de Foco

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Focus ring para inputs */
.form-input:focus {
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}
```

### Touch Targets

- **Mínimo**: 44x44px para todos os elementos clicáveis
- Implementado via `--control-height-md` e `min-height`/`min-width`

### Heading Hierarchy

- **Apenas 1 H1 por página** (geralmente no hero ou título principal)
- Seguir ordem sequencial: H1 → H2 → H3 (nunca pular níveis)

### Screen Reader

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### Skip Link

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
}

.skip-link:focus {
  top: var(--space-4);
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Regras de Consistência

### Header

- **Todas as páginas** usam o mesmo `AppHeader.vue`
- Logo à esquerda, navegação ao centro, ações à direita
- Sticky/fixed com blur backdrop
- Z-index: `--z-fixed` (300)

### Títulos de Seção

Todas as seções seguem este padrão:

```html
<div class="section-header">
  <h2 class="section-title">Título da Seção</h2>
  <p class="section-subtitle">Descrição opcional</p>
</div>
```

### Botões

| Ação | Variante |
|------|----------|
| CTA Principal | `.btn-primary` |
| Ação Secundária | `.btn-secondary` |
| WhatsApp | `.btn-whatsapp` |
| Cancelar/Fechar | `.btn-secondary` |
| Ação Destrutiva | `.btn-action-cancel` (vermelho) |

### Cards

Todos os cards usam:
- `border-radius: var(--radius-card)` (16px)
- `padding: var(--card-padding)`
- `border: 1px solid var(--color-border)`
- Hover: `box-shadow: var(--shadow-md)`

### Formulários

Todos os formulários seguem:
- `.form-group` com `margin-bottom: var(--space-5)`
- `.form-label` acima do input
- `.form-input` com altura mínima de 44px
- Mensagens de erro em `--color-error`

### Ícones

- **Biblioteca**: Lucide Icons (consistente com Vue ecosystem)
- **Tamanhos padrão**: 16px, 20px, 24px
- **Stroke width**: 2px (padrão Lucide)
- **Cor**: `currentColor` (herda do pai)

---

## 12. Proibições

### Cores

- **Proibido** usar cores fora da paleta definida
- **Proibido** usar `#000` para texto (usar `--color-text-primary`)
- **Proibido** criar variações de cor ad-hoc

### Espaçamentos

- **Proibido** usar valores arbitrários de margin/padding
- **Proibido** usar pixels diretos (sempre usar tokens `--space-*`)
- **Proibido** criar espaçamentos inconsistentes entre páginas

### Sombras

- **Proibido** criar sombras customizadas fora do sistema
- **Proibido** usar `box-shadow` inline sem justificativa

### Tipografia

- **Proibido** usar fontes diferentes de Inter
- **Proibido** usar tamanhos fora da escala tipográfica
- **Proibido** usar pesos fora de 400, 500, 600, 700

### Botões

- **Proibido** criar variantes de botão fora do sistema
- **Proibido** alterar cores de botões para a mesma função em páginas diferentes
- **Proibido** botões com altura menor que 44px

### Bordas

- **Proibido** usar `border-radius` fora do sistema de tokens
- **Proibido** bordas com cores arbitrárias

### Layout

- **Proibido** centralizar blocos de texto longo
- **Proibido** margens arbitrárias que quebrem o grid
- **Proibido** containers com larguras customizadas

### Componentes

- **Proibido** criar componentes que dupliquem funcionalidade existente
- **Proibido** estilos inline (exceto casos dinâmicos justificados)
- **Proibido** `!important` (exceto utilitários de acessibilidade)

---

## Z-Index Scale

| Token | Valor | Uso |
|-------|-------|-----|
| `--z-dropdown` | 100 | Dropdowns, menus |
| `--z-sticky` | 200 | Headers sticky |
| `--z-fixed` | 300 | Headers fixed, sidebars |
| `--z-modal-backdrop` | 400 | Overlay de modais |
| `--z-modal` | 500 | Modais |
| `--z-popover` | 600 | Popovers, tooltips |
| `--z-tooltip` | 700 | Tooltips críticos |

---

## Checklist de Implementação

Antes de criar qualquer nova página ou componente, verificar:

- [ ] Cores estão dentro da paleta?
- [ ] Espaçamentos usam tokens `--space-*`?
- [ ] Tipografia segue a escala definida?
- [ ] Botões usam as variantes corretas?
- [ ] Cards seguem o padrão de radius/padding/shadow?
- [ ] Inputs têm altura mínima de 44px?
- [ ] Estados de hover/focus estão implementados?
- [ ] H1 é único na página?
- [ ] Contraste atende WCAG AA?
- [ ] Animações respeitam `prefers-reduced-motion`?

---

## Exemplo de Uso

```vue
<template>
  <section class="section section-alt">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Nossos Planos</h2>
        <p class="section-subtitle">Escolha o melhor para você</p>
      </div>

      <div class="grid gap-6" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))">
        <div class="card">
          <span class="badge badge-pro">Pro</span>
          <h3>Plano Profissional</h3>
          <p>Descrição do plano</p>
          <button class="btn btn-primary btn-lg w-full">
            Assinar Agora
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
```

---

*Design System Sonnar v2.0 — Última atualização: Fevereiro 2026*
