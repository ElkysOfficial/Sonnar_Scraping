# Elkys Design System

Design system proprietário da plataforma **Elkys Client Hub Pro** — construído do zero, sem dependências de bibliotecas UI externas (sem shadcn, Radix, MUI ou Chakra).

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Tokens de Design](#2-tokens-de-design)
   - [Paleta de Cores](#21-paleta-de-cores)
   - [Tipografia](#22-tipografia)
   - [Espaçamento e Raios](#23-espaçamento-e-raios)
   - [Sombras](#24-sombras)
   - [Gradientes](#25-gradientes)
3. [Biblioteca de Ícones SVG](#3-biblioteca-de-ícones-svg)
   - [Arquitetura](#31-arquitetura)
   - [Catálogo de Ícones](#32-catálogo-de-ícones)
   - [API do Componente](#33-api-do-componente)
   - [Uso](#34-uso)
4. [Componentes](#4-componentes)
   - [Button](#41-button)
   - [Card](#42-card)
   - [Input](#43-input)
   - [Textarea](#44-textarea)
   - [AlertDialog](#45-alertdialog)
   - [HexAvatar](#46-hexavatar)
   - [HexPattern](#47-hexpattern)
   - [Toast](#48-toast)
5. [Primitivos de Layout](#5-primitivos-de-layout)
   - [Container](#51-container)
   - [Section](#52-section)
   - [Stack](#53-stack)
   - [Grid](#54-grid)
6. [Componentes de Formulário](#6-componentes-de-formulário)
7. [Componentes do Portal](#7-componentes-do-portal)
   - [MetricTile](#71-metrictile)
   - [AdminMetricCard](#72-adminmetriccard)
   - [StatusBadge](#73-statusbadge)
8. [Layouts do Portal](#8-layouts-do-portal)
   - [ClientLayout](#81-clientlayout)
   - [AdminLayout](#82-adminlayout)
9. [Tema e Dark Mode](#9-tema-e-dark-mode)
10. [Animações](#10-animações)
11. [Responsividade](#11-responsividade)
12. [Acessibilidade](#12-acessibilidade)
13. [Utilitários](#13-utilitários)

---

## 1. Visão Geral

### Stack

| Camada           | Tecnologia                           |
| ---------------- | ------------------------------------ |
| Framework        | React 18 + TypeScript                |
| Estilização      | Tailwind CSS + SCSS (`@layer`)       |
| Variantes        | `class-variance-authority` (CVA)     |
| Merge de classes | `clsx` + `tailwind-merge` via `cn()` |
| Tema             | `next-themes` (class strategy)       |
| Ícones           | SVGR — SVGs como React components    |
| Tipografia       | Poppins (self-hosted, WOFF2)         |
| Notificações     | Sonner (wrapper customizado)         |

### Estrutura de Arquivos

```
src/
├── assets/
│   └── icons/
│       ├── create-icon.tsx       # Factory de ícones com a11y
│       ├── index.ts              # Barrel export de todos os ícones
│       └── svg/                  # SVG source files (65 ícones)
├── design-system/
│   ├── index.ts                  # Barrel export público
│   ├── utils/
│   │   └── cn.ts                 # clsx + tailwind-merge
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── AlertDialog.tsx
│   │   ├── HexAvatar.tsx
│   │   ├── HexPattern.tsx
│   │   └── Toast.tsx
│   ├── primitives/
│   │   ├── Container.tsx
│   │   ├── Section.tsx
│   │   ├── Stack.tsx
│   │   └── Grid.tsx
│   └── form/
│       ├── Label.tsx
│       ├── Field.tsx
│       └── ErrorText.tsx
├── components/portal/
│   ├── ClientLayout.tsx
│   ├── AdminLayout.tsx
│   ├── MetricTile.tsx
│   ├── AdminMetricCard.tsx
│   └── StatusBadge.tsx
└── styles/
    ├── _tokens.scss              # CSS custom properties
    ├── _base.scss                # Reset + estilos base
    ├── _components.scss          # Classes de componentes
    └── _utilities.scss           # Classes utilitárias
```

### Import

Todos os componentes são importados via alias `@/`:

```tsx
// Design system
import { Button, Card, Input, HexAvatar, cn } from "@/design-system";

// Ícones
import { Home, Banknote, AgileMono } from "@/assets/icons";
import type { IconProps } from "@/assets/icons";

// Componentes do portal
import MetricTile from "@/components/portal/MetricTile";
```

---

## 2. Tokens de Design

Todos os tokens são CSS custom properties declaradas em `src/styles/_tokens.scss` com o prefixo `--elk-`. O formato é HSL sem o wrapper `hsl()` — consumidos no Tailwind como `hsl(var(--elk-primary))`.

### 2.1 Paleta de Cores

#### Cores da Marca

| Token                        | Light         | Dark          | Uso                              |
| ---------------------------- | ------------- | ------------- | -------------------------------- |
| `--elk-primary`              | `261 54% 33%` | `261 65% 55%` | Roxo principal — ações primárias |
| `--elk-primary-light`        | `261 58% 45%` | `261 60% 65%` | Hover de primário                |
| `--elk-primary-dark`         | `261 60% 25%` | `261 54% 33%` | Active / pressed                 |
| `--elk-primary-soft`         | `261 40% 95%` | `261 40% 18%` | Backgrounds sutis                |
| `--elk-primary-foreground`   | `0 0% 100%`   | `0 0% 100%`   | Texto sobre primário             |
| `--elk-secondary`            | `223 48% 27%` | `223 55% 42%` | Azul secundário                  |
| `--elk-secondary-light`      | `223 52% 38%` | `223 50% 52%` | Hover de secundário              |
| `--elk-secondary-dark`       | `223 55% 20%` | `223 48% 27%` | Active de secundário             |
| `--elk-secondary-foreground` | `0 0% 100%`   | `0 0% 100%`   | Texto sobre secundário           |
| `--elk-accent`               | `180 75% 32%` | `180 70% 45%` | Ciano — CTAs de destaque         |
| `--elk-accent-light`         | `180 70% 42%` | `180 65% 55%` | Hover de accent                  |
| `--elk-accent-soft`          | `180 50% 95%` | `180 40% 18%` | Background accent sutil          |
| `--elk-accent-foreground`    | `0 0% 100%`   | `0 0% 100%`   | Texto sobre accent               |

#### Cores Semânticas

| Token                          | Light         | Dark          | Uso                      |
| ------------------------------ | ------------- | ------------- | ------------------------ |
| `--elk-destructive`            | `0 72% 51%`   | `0 72% 55%`   | Ações destrutivas / erro |
| `--elk-destructive-foreground` | `0 0% 100%`   | `0 0% 100%`   | Texto sobre destrutivo   |
| `--elk-success`                | `142 71% 35%` | `142 65% 42%` | Sucesso / confirmação    |
| `--elk-success-foreground`     | `0 0% 100%`   | `0 0% 100%`   | Texto sobre sucesso      |
| `--elk-warning`                | `38 92% 50%`  | `38 88% 55%`  | Alerta / atenção         |
| `--elk-warning-foreground`     | `0 0% 0%`     | `0 0% 0%`     | Texto sobre warning      |

#### Cores de Interface

| Token                    | Light         | Dark          | Uso              |
| ------------------------ | ------------- | ------------- | ---------------- |
| `--elk-background`       | `0 0% 100%`   | `224 47% 9%`  | Fundo da página  |
| `--elk-foreground`       | `224 47% 11%` | `220 14% 96%` | Texto principal  |
| `--elk-card`             | `0 0% 100%`   | `224 42% 12%` | Fundo de cards   |
| `--elk-card-foreground`  | `224 47% 11%` | `220 14% 96%` | Texto em cards   |
| `--elk-muted`            | `220 14% 96%` | `224 30% 18%` | Fundos atenuados |
| `--elk-muted-foreground` | `220 13% 46%` | `220 10% 60%` | Texto secundário |
| `--elk-border`           | `220 13% 91%` | `224 25% 20%` | Bordas padrão    |
| `--elk-border-muted`     | `220 13% 95%` | `224 25% 16%` | Bordas sutis     |
| `--elk-input`            | `220 13% 91%` | `224 25% 20%` | Bordas de inputs |
| `--elk-ring`             | `261 54% 33%` | `261 65% 55%` | Anel de foco     |

#### Escala de Neutros (10 níveis)

| Token           | Light (HSL)   | Dark (HSL)    |
| --------------- | ------------- | ------------- |
| `--neutral-50`  | `220 14% 98%` | `224 30% 18%` |
| `--neutral-100` | `220 14% 96%` | `224 28% 16%` |
| `--neutral-200` | `220 13% 91%` | `224 25% 20%` |
| `--neutral-300` | `220 11% 84%` | `224 22% 25%` |
| `--neutral-400` | `220 9% 64%`  | `220 15% 40%` |
| `--neutral-500` | `220 8% 46%`  | `220 12% 50%` |
| `--neutral-600` | `220 13% 35%` | `220 10% 60%` |
| `--neutral-700` | `220 17% 25%` | `220 10% 72%` |
| `--neutral-800` | `220 24% 17%` | `220 12% 84%` |
| `--neutral-900` | `224 47% 11%` | `220 14% 96%` |

### 2.2 Tipografia

**Família:** `"Poppins", system-ui, sans-serif` — self-hosted em WOFF2, `font-display: swap`.

**Pesos disponíveis:** 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold).

#### Tamanhos

| Token              | Valor      | px (base 16) |
| ------------------ | ---------- | ------------ |
| `--font-size-xs`   | `0.75rem`  | 12px         |
| `--font-size-sm`   | `0.875rem` | 14px         |
| `--font-size-base` | `1rem`     | 16px         |
| `--font-size-lg`   | `1.125rem` | 18px         |
| `--font-size-xl`   | `1.25rem`  | 20px         |
| `--font-size-2xl`  | `1.5rem`   | 24px         |
| `--font-size-3xl`  | `2rem`     | 32px         |
| `--font-size-4xl`  | `2.5rem`   | 40px         |
| `--font-size-5xl`  | `3rem`     | 48px         |

#### Line Heights

| Token                   | Valor  | Uso típico            |
| ----------------------- | ------ | --------------------- |
| `--line-height-tight`   | `1.2`  | Headings grandes      |
| `--line-height-snug`    | `1.4`  | Headings menores      |
| `--line-height-normal`  | `1.6`  | Corpo de texto        |
| `--line-height-relaxed` | `1.75` | Texto longo / artigos |

#### Font Weights

| Token                    | Valor |
| ------------------------ | ----- |
| `--font-weight-normal`   | `400` |
| `--font-weight-medium`   | `500` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold`     | `700` |

#### Letter Spacing

| Token                     | Valor     | Uso              |
| ------------------------- | --------- | ---------------- |
| `--letter-spacing-tight`  | `-0.02em` | Headings grandes |
| `--letter-spacing-normal` | `0`       | Padrão           |
| `--letter-spacing-wide`   | `0.02em`  | Labels / caps    |

### 2.3 Espaçamento e Raios

**Raio padrão do sistema:** `--elk-radius: 0.5rem` (8px)

| Token           | Valor      | px              |
| --------------- | ---------- | --------------- |
| `--radius-xs`   | `0.125rem` | 2px             |
| `--radius-sm`   | `0.375rem` | 6px             |
| `--radius-md`   | `0.5rem`   | 8px             |
| `--radius-lg`   | `0.75rem`  | 12px            |
| `--radius-xl`   | `1rem`     | 16px            |
| `--radius-2xl`  | `1.25rem`  | 20px            |
| `--radius-3xl`  | `1.5rem`   | 24px            |
| `--radius-full` | `9999px`   | Pill / circular |

### 2.4 Sombras

#### Sombras Base

| Token         | Valor                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)`                                       |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`    |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`  |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` |

> Em dark mode os valores alpha são ampliados (0.05→0.2, 0.1→0.25/0.3).

#### Sombras de Marca

| Token                 | Light                                            | Dark     |
| --------------------- | ------------------------------------------------ | -------- |
| `--shadow-primary`    | `0 4px 14px -3px hsl(var(--elk-primary) / 0.25)` | `/ 0.35` |
| `--shadow-primary-lg` | `0 10px 25px -5px hsl(var(--elk-primary) / 0.2)` | `/ 0.3`  |
| `--shadow-elegant`    | alias de `--shadow-primary`                      | —        |
| `--shadow-glow`       | `0 0 30px hsl(var(--elk-primary) / 0.12)`        | `/ 0.18` |
| `--shadow-card`       | alias de `--shadow-sm`                           | —        |
| `--shadow-card-hover` | alias de `--shadow-md`                           | —        |

### 2.5 Gradientes

| Token                | Definição                                                               |
| -------------------- | ----------------------------------------------------------------------- |
| `--gradient-primary` | `linear-gradient(135deg, hsl(--elk-primary), hsl(--elk-primary-light))` |
| `--gradient-hero`    | `linear-gradient(135deg, hsl(--elk-secondary), hsl(--elk-primary))`     |
| `--gradient-subtle`  | `linear-gradient(180deg, hsl(--elk-background), hsl(--neutral-100))`    |
| `--gradient-accent`  | `linear-gradient(135deg, hsl(--elk-accent), hsl(--elk-accent-light))`   |

> Em dark mode `--gradient-subtle` termina em `hsl(224 35% 14%)` ao invés de `--neutral-100`.

---

## 3. Biblioteca de Ícones SVG

### 3.1 Arquitetura

Os ícones são SVGs importados como React components via **SVGR** (`?react` suffix no Vite). Cada SVG é envolto pela factory `createIcon()` que padroniza props e acessibilidade.

```
src/assets/icons/
├── create-icon.tsx     # forwardRef wrapper com a11y
├── index.ts            # 65 exports nomeados
└── svg/                # 65+ arquivos .svg
```

**`createIcon(SvgComponent, displayName)`** — factory que aplica:

- `size` → `width` e `height` (padrão `24`)
- `strokeWidth` → espessura do traço (padrão `2`)
- `focusable="false"` — sempre
- `aria-hidden="true"` — padrão (ícone decorativo)
- Quando `title` ou `aria-label` fornecido: `role="img"` + `aria-hidden` removido

### 3.2 Catálogo de Ícones

**65 ícones exportados**, agrupados por categoria:

#### Navegação e Setas

| Export         | Arquivo SVG         | Uso                   |
| -------------- | ------------------- | --------------------- |
| `ArrowLeft`    | `arrow-left.svg`    | Voltar, paginação     |
| `ArrowRight`   | `arrow-right.svg`   | Avançar, paginação    |
| `ArrowUp`      | `arrow-up.svg`      | Scroll top, ordenação |
| `ChevronRight` | `chevron-right.svg` | Breadcrumbs, listas   |
| `Menu`         | `menu.svg`          | Hamburger mobile      |
| `X`            | `x.svg`             | Fechar, limpar        |

#### Interface

| Export         | Arquivo SVG         | Uso                         |
| -------------- | ------------------- | --------------------------- |
| `Home`         | `home.svg`          | Dashboard / visão geral     |
| `Eye`          | `eye.svg`           | Visualizar, toggle senha    |
| `Search`       | `search.svg`        | Busca                       |
| `Cog`          | `cog.svg`           | Configurações               |
| `Wrench`       | `wrench.svg`        | Ferramentas / configurações |
| `FileText`     | `file-text.svg`     | Documentos, relatórios      |
| `Folder`       | `folder.svg`        | Pastas, seções de docs      |
| `ExternalLink` | `external-link.svg` | Links externos              |
| `Send`         | `send.svg`          | Enviar mensagem / email     |
| `Play`         | `play.svg`          | Reproduzir, demonstração    |

#### Desenvolvimento

| Export      | Arquivo SVG     | Uso                         |
| ----------- | --------------- | --------------------------- |
| `Code`      | `code.svg`      | Código inline               |
| `Code2`     | `code-2.svg`    | Bloco de código, dev        |
| `Blueprint` | `blueprint.svg` | Arquitetura, planejamento   |
| `Network`   | `network.svg`   | Infraestrutura, integrações |
| `Globe`     | `globe.svg`     | Web, domínios               |

#### Negócios e Gestão

| Export        | Arquivo SVG        | Uso                     |
| ------------- | ------------------ | ----------------------- |
| `Building2`   | `building-2.svg`   | Clientes / empresas     |
| `Users`       | `users.svg`        | Equipe, membros         |
| `Target`      | `target.svg`       | Metas, objetivos        |
| `TrendingUp`  | `trending-up.svg`  | Crescimento, métricas   |
| `BarChart`    | `bar-chart.svg`    | Gráficos, analytics     |
| `Clock`       | `clock.svg`        | Tempo, prazo, histórico |
| `CheckCircle` | `check-circle.svg` | Concluído, validação    |
| `Shield`      | `shield.svg`       | Segurança, privacidade  |

#### Financeiro

| Export      | Arquivo SVG      | Uso                    |
| ----------- | ---------------- | ---------------------- |
| `Banknote`  | `banknote.svg`   | Financeiro, pagamentos |
| `PiggyBank` | `piggy-bank.svg` | Poupança, budget       |
| `Wallet`    | `wallet.svg`     | Carteira, saldo        |
| `HandCoins` | `hand-coins.svg` | Transações, cobranças  |
| `Receipt`   | `receipt.svg`    | Notas, recibos         |

#### Suporte e Comunicação

| Export       | Arquivo SVG      | Uso                  |
| ------------ | ---------------- | -------------------- |
| `Headphones` | `headphones.svg` | Suporte, atendimento |
| `Phone`      | `phone.svg`      | Contato, telefone    |
| `Mail`       | `mail.svg`       | Email, mensagens     |

#### Identidade e Marca

| Export    | Arquivo SVG   | Uso                     |
| --------- | ------------- | ----------------------- |
| `Hexagon` | `hexagon.svg` | Identidade visual Elkys |
| `Star`    | `star.svg`    | Destaque, favorito      |
| `Heart`   | `heart.svg`   | Engajamento             |
| `Quote`   | `quote.svg`   | Depoimentos, citações   |
| `Zap`     | `zap.svg`     | Performance, velocidade |

#### Calendário

| Export      | Arquivo SVG      | Uso                  |
| ----------- | ---------------- | -------------------- |
| `CalendarX` | `calendar-x.svg` | Projetos, cronograma |

#### Ícones Proprietários Elkys (3 variantes cada)

Ícones customizados criados especificamente para a plataforma Elkys:

| Export        | Variante      | Arquivo SVG        | Uso recomendado             |
| ------------- | ------------- | ------------------ | --------------------------- |
| `Agile`       | Outline       | `agile.svg`        | Sobre fundo claro, em texto |
| `AgileMono`   | Monocromático | `agile-mono.svg`   | Sidebar, navegação ativa    |
| `AgileFill`   | Preenchido    | `agile-fill.svg`   | Destaque, badges            |
| `Suporte`     | Outline       | `suporte.svg`      | Sobre fundo claro, em texto |
| `SuporteMono` | Monocromático | `suporte-mono.svg` | Sidebar, navegação          |
| `SuporteFill` | Preenchido    | `suporte-fill.svg` | Destaque, badges            |

#### Tema e Preferências

| Export   | Arquivo SVG  | Uso               |
| -------- | ------------ | ----------------- |
| `Sun`    | `sun.svg`    | Toggle light mode |
| `Moon`   | `moon.svg`   | Toggle dark mode  |
| `Cookie` | `cookie.svg` | Aviso de cookies  |

#### Redes Sociais

| Export      | Arquivo SVG     | Uso             |
| ----------- | --------------- | --------------- |
| `Github`    | `github.svg`    | Links GitHub    |
| `Instagram` | `instagram.svg` | Links Instagram |
| `Linkedin`  | `linkedin.svg`  | Links LinkedIn  |

### 3.3 API do Componente

```typescript
interface IconProps extends SVGProps<SVGSVGElement> {
  /** Largura e altura em pixels. Padrão: 24 */
  size?: number | string;
  /** Espessura do traço SVG. Padrão: 2 */
  strokeWidth?: number | string;
  /** Título acessível — ativa role="img" e aria-label quando fornecido */
  title?: string;
  className?: string;
}
```

Todos os ícones suportam `ref` via `forwardRef<SVGSVGElement>`.

### 3.4 Uso

```tsx
import { Home, Banknote, AgileMono, Agile } from "@/assets/icons";
import type { IconProps } from "@/assets/icons";

// Ícone decorativo (padrão — aria-hidden="true")
<Home size={20} className="text-primary" />

// Ícone com stroke personalizado
<Banknote size={18} strokeWidth={1.5} />

// Ícone acessível com título
<Agile size={24} title="Metodologia Ágil" />

// Ícone como prop de componente
function MyCard({ icon: Icon }: { icon: ComponentType<IconProps> }) {
  return <Icon size={16} className="shrink-0" />;
}
<MyCard icon={AgileMono} />

// Passando via Tailwind para cor dinâmica
<Banknote size={20} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
```

**Convenções de tamanho:**

| Contexto                  | `size`            |
| ------------------------- | ----------------- |
| Inline em texto           | `14`              |
| Labels / badges           | `16`              |
| Botões (`[&_svg]:size-4`) | `16` (automático) |
| Sidebar / navegação       | `17–18`           |
| Cards / métricas          | `18–20`           |
| Padrão                    | `24`              |
| Ícones hero               | `32–48`           |

---

## 4. Componentes

### 4.1 Button

`src/design-system/components/Button.tsx`

Construído com **CVA** (class-variance-authority). Todos os tamanhos garantem mínimo de **44px** (WCAG AAA para touch targets).

```tsx
import { Button } from "@/design-system";

<Button variant="default" size="default">
  Salvar
</Button>;
```

#### Props

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "accent"
    | "gradient"
    | "gradient_secondary"
    | "hero_outline";
  size?: "default" | "sm" | "lg" | "icon";
}
```

#### Variantes

| `variant`            | Aparência                  | Uso                                    |
| -------------------- | -------------------------- | -------------------------------------- |
| `default`            | Roxo primário sólido       | Ação principal da página               |
| `accent`             | Ciano sólido               | CTAs de alta conversão                 |
| `secondary`          | Azul sólido                | Ação de suporte                        |
| `outline`            | Borda + fundo transparente | Ação secundária                        |
| `ghost`              | Sem borda, sem fundo       | Navegação, ações terciárias            |
| `link`               | Texto sublinhado           | Links inline                           |
| `gradient`           | Gradiente roxo (primary)   | Botões de destaque especial            |
| `gradient_secondary` | Gradiente sutil            | Alternativa suave ao gradient          |
| `destructive`        | Vermelho sólido            | Excluir, remover                       |
| `hero_outline`       | Branco sobre fundo escuro  | Seções hero com fundo escuro/gradiente |

#### Tamanhos

| `size`    | Height                      | Padding     | Texto       |
| --------- | --------------------------- | ----------- | ----------- |
| `default` | `h-10` (min 44px)           | `px-4 py-2` | `text-sm`   |
| `sm`      | `h-9` (min 44px)            | `px-3`      | `text-xs`   |
| `lg`      | `h-11` (min 44px)           | `px-6`      | `text-base` |
| `icon`    | `h-10 w-10` (min 44px×44px) | —           | —           |

#### Comportamento base

- Transição: `duration-150 ease-out`
- Focus ring: `ring-2 ring-ring ring-offset-2`
- SVGs filhos: `pointer-events-none`, `size-4` (16px), `shrink-0`
- Disabled: `pointer-events-none opacity-50`

#### Exemplos

```tsx
// Ação principal
<Button>Confirmar</Button>

// Com ícone
<Button variant="outline" size="sm">
  <Home /> Início
</Button>

// CTA
<Button variant="accent" size="lg">
  Começar agora
</Button>

// Ícone apenas
<Button variant="ghost" size="icon" aria-label="Fechar">
  <X />
</Button>

// Destrutivo
<Button variant="destructive">Excluir projeto</Button>

// Gradiente
<Button variant="gradient">Ver proposta</Button>

// Hero section
<Button variant="hero_outline">Saiba mais</Button>
```

---

### 4.2 Card

`src/design-system/components/Card.tsx`

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/design-system";
```

#### Anatomia

```tsx
<Card>
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição complementar</CardDescription>
  </CardHeader>
  <CardContent>{/* conteúdo principal */}</CardContent>
  <CardFooter>
    <Button>Ação</Button>
  </CardFooter>
</Card>
```

#### Classes

| Componente        | Classes base                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Card`            | `rounded-lg border border-border bg-card text-card-foreground shadow-card hover:shadow-card-hover transition-all duration-200` |
| `CardHeader`      | `flex flex-col space-y-1.5 p-6`                                                                                                |
| `CardTitle`       | `text-xl font-semibold leading-tight tracking-tight` (tag `h3`)                                                                |
| `CardDescription` | `text-sm text-muted-foreground` (tag `p`)                                                                                      |
| `CardContent`     | `p-6 pt-0`                                                                                                                     |
| `CardFooter`      | `flex items-center p-6 pt-0`                                                                                                   |

Todos aceitam `className` para extensão.

---

### 4.3 Input

`src/design-system/components/Input.tsx`

```tsx
import { Input } from "@/design-system";

<Input type="email" placeholder="seu@email.com" />;
```

**Classes:** `flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm`

- Largura full por padrão
- Altura mínima 44px (acessibilidade)
- Texto responsivo: `text-base` → `md:text-sm`
- Aceita todos os atributos HTML nativos de `<input>`

---

### 4.4 Textarea

`src/design-system/components/Textarea.tsx`

```tsx
import { Textarea } from "@/design-system";

<Textarea placeholder="Descreva o problema..." rows={4} />;
```

- Altura mínima: `min-h-[120px]`
- Mesma estética do `Input`
- Aceita todos os atributos HTML nativos de `<textarea>`

---

### 4.5 AlertDialog

`src/design-system/components/AlertDialog.tsx`

Dialog modal de confirmação com suporte a ações destrutivas e estado de carregamento.

```tsx
import { AlertDialog } from "@/design-system";

<AlertDialog
  open={isOpen}
  title="Excluir projeto"
  description="Esta ação não pode ser desfeita. O projeto e todos os dados serão removidos permanentemente."
  confirmLabel="Excluir"
  cancelLabel="Cancelar"
  destructive
  loading={isDeleting}
  loadingLabel="Excluindo..."
  onConfirm={handleDelete}
  onCancel={() => setIsOpen(false)}
/>;
```

#### Props

| Prop           | Tipo         | Padrão           | Descrição                                           |
| -------------- | ------------ | ---------------- | --------------------------------------------------- |
| `open`         | `boolean`    | —                | Controla visibilidade                               |
| `title`        | `string`     | —                | Título do dialog                                    |
| `description`  | `string`     | —                | Texto descritivo                                    |
| `confirmLabel` | `string`     | `"Confirmar"`    | Label do botão de confirmação                       |
| `cancelLabel`  | `string`     | `"Cancelar"`     | Label do botão de cancelamento                      |
| `destructive`  | `boolean`    | `false`          | Modo destrutivo (ícone de lixeira + botão vermelho) |
| `loading`      | `boolean`    | `false`          | Estado de carregamento no botão confirm             |
| `loadingLabel` | `string`     | `"Removendo..."` | Texto durante loading                               |
| `onConfirm`    | `() => void` | —                | Callback de confirmação                             |
| `onCancel`     | `() => void` | —                | Callback de cancelamento                            |

#### Comportamentos

- **Backdrop:** `bg-black/50 backdrop-blur-sm` com `animate-in fade-in`
- **Fechar com Escape:** listener no `document`
- **Auto-focus:** botão confirm recebe foco 50ms após abertura
- **Scroll lock:** `document.body.style.overflow = "hidden"` enquanto aberto
- **ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`

---

### 4.6 HexAvatar

`src/design-system/components/HexAvatar.tsx`

Avatar com máscara hexagonal — elemento central da identidade visual Elkys.

```tsx
import { HexAvatar } from "@/design-system";

<HexAvatar size="md" src="https://example.com/photo.jpg" alt="João Silva" fallback="JS" />;
```

#### Props

| Prop                    | Tipo                                     | Padrão      | Descrição                                     |
| ----------------------- | ---------------------------------------- | ----------- | --------------------------------------------- |
| `fallback`              | `string`                                 | —           | **Obrigatório.** Iniciais exibidas sem imagem |
| `src`                   | `string \| null`                         | `undefined` | URL da imagem                                 |
| `alt`                   | `string`                                 | `""`        | Texto alternativo da imagem                   |
| `size`                  | `"sm" \| "md" \| "lg" \| "xl" \| "hero"` | `"md"`      | Tamanho do avatar                             |
| `backgroundClassName`   | `string`                                 | —           | Classe extra na imagem de fundo hexagonal     |
| `contentInsetClassName` | `string`                                 | —           | Classe extra no container interno (máscara)   |
| `imageClassName`        | `string`                                 | —           | Classe extra na imagem de perfil              |
| `imageStyle`            | `CSSProperties`                          | —           | Estilo inline na imagem (zoom, posição)       |

#### Tamanhos

| `size` | Container                   | Inset          | Texto fallback         |
| ------ | --------------------------- | -------------- | ---------------------- |
| `sm`   | `h-10 w-10`                 | `inset-[10%]`  | `text-xs`              |
| `md`   | `h-14 w-14`                 | `inset-[9%]`   | `text-sm`              |
| `lg`   | `h-20 w-20`                 | `inset-[8.5%]` | `text-xl`              |
| `xl`   | `h-28 w-28`                 | `inset-[8%]`   | `text-3xl`             |
| `hero` | `h-36 w-36 md:h-44 md:w-44` | `inset-[7.5%]` | `text-4xl md:text-5xl` |

#### Estrutura interna

```
div (container + drop-shadow)
├── img (hexagonal.webp — moldura visual)
├── div (máscara hexagonal via CSS mask)
│   ├── img (foto do usuário) — se src fornecido
│   └── div (fallback com initials + gradient-primary) — se não tem src
└── div (overlay de borda border-white/15)
```

**Drop shadow:** `0 14px 24px hsl(var(--elk-primary)/0.12)` (light) / `0 16px 26px hsl(var(--elk-primary)/0.24)` (dark)

**Fallback background:** `bg-gradient-primary` com texto `text-white font-semibold`

```tsx
// Ajuste de zoom/posição da foto
<HexAvatar
  size="lg"
  src={photoUrl}
  fallback="JS"
  imageStyle={{ transform: "scale(1.2)", objectPosition: "top center" }}
/>
```

---

### 4.7 HexPattern

`src/design-system/components/HexPattern.tsx`

Elemento decorativo hexagonal com animação de rotação — usado para enriquecer visualmente cards e banners.

```tsx
import { HexPattern } from "@/design-system";

<div className="relative overflow-hidden">
  <HexPattern variant="card" />
  {/* conteúdo */}
</div>;
```

#### Props

| Prop        | Tipo                                         | Padrão   |
| ----------- | -------------------------------------------- | -------- |
| `variant`   | `"banner" \| "card" \| "subtle" \| "inline"` | `"card"` |
| `className` | `string`                                     | —        |

#### Variantes

| `variant` | Tamanho                     | Opacidade (light/dark)      | Animação                                  |
| --------- | --------------------------- | --------------------------- | ----------------------------------------- |
| `banner`  | `w-48 h-48 md:w-60 md:h-60` | `0.25 / 0.10`               | `animate-hex-spin` (20s)                  |
| `card`    | `w-44 h-44 md:w-48 md:h-48` | `0.25 / 0.10`               | `animate-hex-spin` (20s)                  |
| `subtle`  | `w-32 h-32 md:w-36 md:h-36` | `0.06 / 0.18`               | `animate-hex-spin` (20s)                  |
| `inline`  | `w-20 h-20`                 | `0.10 / 0.15` (hover: 0.25) | `animate-hex-spin` + `transition-opacity` |

Posicionamento padrão: `absolute -right-{n} -bottom-{n}` — requer `overflow-hidden` no pai.

---

### 4.8 Toast

`src/design-system/components/Toast.tsx`

Wrapper sobre **Sonner** com tema automático via `next-themes`.

```tsx
// Em App.tsx ou root layout
import { Toaster } from "@/design-system";
<Toaster />;

// Em qualquer componente
import { toast } from "sonner";
toast.success("Projeto salvo com sucesso!");
toast.error("Erro ao enviar mensagem.");
toast("Notificação simples.");
```

**Classes aplicadas ao Sonner:**

| Elemento       | Classes                                                 |
| -------------- | ------------------------------------------------------- |
| `toast`        | `bg-background text-foreground border-border shadow-lg` |
| `description`  | `text-muted-foreground`                                 |
| `actionButton` | `bg-primary text-primary-foreground`                    |
| `cancelButton` | `bg-muted text-muted-foreground`                        |

---

## 5. Primitivos de Layout

### 5.1 Container

```tsx
import { Container } from "@/design-system";

<Container>{/* max-w limitado, centralizado, com padding responsivo */}</Container>;
```

**Classes:** `container mx-auto px-4`

Segue a configuração do container Tailwind: centralizado, padding responsivo por breakpoint (ver seção [Responsividade](#11-responsividade)).

---

### 5.2 Section

```tsx
import { Section } from "@/design-system";

<Section bg="gradient-subtle">
  <Container>...</Container>
</Section>;
```

#### Props

| Prop | Tipo                                                                        | Padrão         |
| ---- | --------------------------------------------------------------------------- | -------------- |
| `bg` | `"background" \| "muted" \| "gradient-subtle" \| "gradient-hero" \| "card"` | `"background"` |

**Padding padrão:** `py-16 md:py-20 lg:py-24` (64px → 80px → 96px)

| `bg`              | Estilo aplicado      |
| ----------------- | -------------------- |
| `background`      | `bg-background`      |
| `muted`           | `bg-muted`           |
| `gradient-subtle` | `bg-gradient-subtle` |
| `gradient-hero`   | `bg-gradient-hero`   |
| `card`            | `bg-card`            |

---

### 5.3 Stack

```tsx
import { Stack } from "@/design-system";

<Stack gap={6}>
  <Item />
  <Item />
</Stack>;
```

#### Props

| Prop  | Tipo                    | Padrão |
| ----- | ----------------------- | ------ |
| `gap` | `2 \| 3 \| 4 \| 6 \| 8` | `4`    |

**Classes geradas:** `flex flex-col gap-{n}`

| `gap` | Espaçamento |
| ----- | ----------- |
| `2`   | 8px         |
| `3`   | 12px        |
| `4`   | 16px        |
| `6`   | 24px        |
| `8`   | 32px        |

---

### 5.4 Grid

```tsx
import { Grid } from "@/design-system";

<Grid cols={3} gap={6}>
  <Card />
  <Card />
  <Card />
</Grid>;
```

#### Props

| Prop   | Tipo          | Padrão |
| ------ | ------------- | ------ |
| `cols` | `2 \| 3 \| 4` | —      |
| `gap`  | `4 \| 6 \| 8` | —      |

#### Breakpoints por `cols`

| `cols` | Mobile   | Tablet (md) | Desktop (lg) |
| ------ | -------- | ----------- | ------------ |
| `2`    | 1 coluna | 2 colunas   | 2 colunas    |
| `3`    | 1 coluna | 2 colunas   | 3 colunas    |
| `4`    | 1 coluna | 2 colunas   | 4 colunas    |

#### `gap`

| `gap` | Classes                        |
| ----- | ------------------------------ |
| `4`   | `gap-4` (16px)                 |
| `6`   | `gap-6` (24px)                 |
| `8`   | `gap-6 md:gap-8` (24px → 32px) |

---

## 6. Componentes de Formulário

Usados em conjunto com `react-hook-form` + `zod`.

```tsx
import { Field, Label, Input, ErrorText } from "@/design-system";

<Field>
  <Label htmlFor="email">E-mail</Label>
  <Input id="email" type="email" {...register("email")} />
  {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
</Field>;
```

### Label

**Classes:** `block text-sm font-medium text-foreground mb-2`

Renderiza `<label>`. Aceita todos os atributos HTML de `<label>`.

### Field

**Classes:** `space-y-2`

Container semântico que agrupa Label + Input + ErrorText. Renderiza `<div>`.

### ErrorText

**Classes:** `text-destructive text-xs mt-1`

**Atributos:** `role="alert"` — lido automaticamente por screen readers.

---

## 7. Componentes do Portal

### 7.1 MetricTile

`src/components/portal/MetricTile.tsx`

Card compacto para exibição de métricas com ícone e tom de cor.

```tsx
import MetricTile from "@/components/portal/MetricTile";
import { Banknote } from "@/assets/icons";

<MetricTile label="Receita mensal" value="R$ 12.500" icon={Banknote} tone="primary" />;
```

#### Props

| Prop    | Tipo                       | Padrão      |
| ------- | -------------------------- | ----------- |
| `label` | `string`                   | —           |
| `value` | `string`                   | —           |
| `icon`  | `ComponentType<IconProps>` | —           |
| `tone`  | `MetricTone`               | `"primary"` |

#### MetricTone

| `tone`        | Texto                   | Ícone (bg + texto)                                     |
| ------------- | ----------------------- | ------------------------------------------------------ |
| `primary`     | `text-primary`          | `bg-primary-soft text-primary` / dark: `bg-primary/15` |
| `accent`      | `text-accent`           | `bg-accent/10 text-accent`                             |
| `success`     | `text-success`          | `bg-success/10 text-success`                           |
| `warning`     | `text-warning`          | `bg-warning/10 text-warning`                           |
| `destructive` | `text-destructive`      | `bg-destructive/15 text-destructive`                   |
| `secondary`   | `text-muted-foreground` | `bg-muted text-muted-foreground`                       |

**Layout:** `flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5`

- Ícone wrapper: `h-10 w-10 rounded-xl`
- Label: `text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground`
- Value: `text-xl font-semibold tracking-tight`

---

### 7.2 AdminMetricCard

`src/components/portal/AdminMetricCard.tsx`

Versão expandida do MetricTile, usa `Card` como container e suporta hint.

```tsx
import AdminMetricCard from "@/components/portal/AdminMetricCard";
import { TrendingUp } from "@/assets/icons";

<AdminMetricCard
  label="Projetos ativos"
  value="12"
  hint="+3 este mês"
  icon={TrendingUp}
  tone="accent"
/>;
```

#### Props adicionais

| Prop        | Tipo     | Descrição                          |
| ----------- | -------- | ---------------------------------- |
| `hint`      | `string` | Texto complementar abaixo do valor |
| `className` | `string` | Classe extra no Card raiz          |

**Value:** `text-2xl md:text-[28px] font-semibold`
**Hint:** `text-sm text-muted-foreground`

---

### 7.3 StatusBadge

`src/components/portal/StatusBadge.tsx`

Badge de status em pill shape.

```tsx
import StatusBadge from "@/components/portal/StatusBadge";

<StatusBadge label="Em andamento" tone="accent" />
<StatusBadge label="Concluído" tone="success" />
<StatusBadge label="Atrasado" tone="destructive" />
```

#### Props

| Prop        | Tipo         | Descrição      |
| ----------- | ------------ | -------------- |
| `label`     | `string`     | Texto do badge |
| `tone`      | `MetricTone` | Tom de cor     |
| `className` | `string`     | Classe extra   |

**Classes base:** `inline-flex min-h-[28px] items-center rounded-full px-3 text-xs font-semibold tracking-wide`

Usa o mesmo mapa de tons do `MetricTile`.

---

## 8. Layouts do Portal

### 8.1 ClientLayout

`src/components/portal/ClientLayout.tsx`

Layout base do portal do cliente com sidebar colapsável, header sticky e perfil.

#### Sidebar

| Estado    | Largura        |
| --------- | -------------- |
| Expandida | `224px` (w-56) |
| Colapsada | `56px` (w-14)  |

**Persistência:** `localStorage` key `elkys-client-sidebar-collapsed`

**Itens de navegação:**

| Label       | Rota                         | Ícone       |
| ----------- | ---------------------------- | ----------- |
| Visão Geral | `/portal/cliente`            | `Home`      |
| Projetos    | `/portal/cliente/projetos`   | `CalendarX` |
| Financeiro  | `/portal/cliente/financeiro` | `Banknote`  |
| Suporte     | `/portal/cliente/suporte`    | `Phone`     |

**Item ativo:** `aria-current="page"` + classes de destaque com `bg-primary-soft text-primary`

#### Header

- Altura: `h-20`
- Sticky no topo
- Exibe título + descrição da página atual
- Data formatada em pt-BR: `"DD de Mês de YYYY"`
- Relógio atualizado a cada 10 segundos

#### Perfil

- `HexAvatar` size `md` com imagem, initials fallback
- Suporte a evento global `PORTAL_PROFILE_UPDATED_EVENT` para atualização em tempo real
- Zoom e posição customizáveis via `imageStyle`

---

### 8.2 AdminLayout

`src/components/portal/AdminLayout.tsx`

Layout base do portal admin com sidebar role-based e navegação por seções.

#### Sidebar

| Estado    | Largura               |
| --------- | --------------------- |
| Expandida | `224px` (w-56)        |
| Colapsada | `~104px` (w-[6.5rem]) |

**Persistência:** `localStorage` key `elkys-admin-sidebar-collapsed`

#### Estrutura de navegação por seção

**Seção: Visão Geral**

| Label       | Rota            | Ícone      | Roles |
| ----------- | --------------- | ---------- | ----- |
| Visão Geral | `/portal/admin` | `BarChart` | todos |

**Seção: Gestão**

| Label      | Rota                       | Ícone         | Roles                         |
| ---------- | -------------------------- | ------------- | ----------------------------- |
| Clientes   | `/portal/admin/clientes`   | `Building2`   | admin_super, admin, marketing |
| Projetos   | `/portal/admin/projetos`   | `AgileMono`   | todos                         |
| Financeiro | `/portal/admin/financeiro` | `Banknote`    | admin_super, admin, marketing |
| Equipe     | `/portal/admin/equipe`     | `Users`       | **admin_super only**          |
| Suporte    | `/portal/admin/suporte`    | `SuporteFill` | todos                         |

**Seção: Marketing**

| Label      | Rota                                        | Ícone       | Roles                         |
| ---------- | ------------------------------------------- | ----------- | ----------------------------- |
| Calendário | `/portal/admin/calendario`                  | `CalendarX` | admin_super, admin, marketing |
| Docs M&D   | `/portal/admin/documentos/marketing-design` | `Folder`    | admin_super, admin, marketing |

**Seção: Desenvolvimento**

| Label    | Rota                                     | Ícone   | Roles                         |
| -------- | ---------------------------------------- | ------- | ----------------------------- |
| Docs Dev | `/portal/admin/documentos/desenvolvedor` | `Code2` | admin_super, admin, developer |

#### Roles e permissões

| Role          | Acesso                                                            |
| ------------- | ----------------------------------------------------------------- |
| `admin_super` | Total — todas as seções                                           |
| `admin`       | Tudo exceto Equipe                                                |
| `marketing`   | Visão Geral, Clientes, Projetos, Financeiro, Calendário, Docs M&D |
| `developer`   | Visão Geral, Projetos, Docs Dev                                   |
| `support`     | Visão Geral, Projetos, Suporte                                    |
| `cliente`     | Portal cliente — não acessa admin                                 |

#### Header

- Altura: `h-16`
- Mesmos padrões de sticky, data e perfil do ClientLayout

---

## 9. Tema e Dark Mode

### Implementação

- **Biblioteca:** `next-themes`
- **Estratégia:** `class` — adiciona/remove `.dark` no `<html>`
- **Tailwind config:** `darkMode: ["class"]`

### Uso nos componentes

```tsx
import { useTheme } from "next-themes";

const { resolvedTheme } = useTheme();
const isDark = resolvedTheme === "dark";

// Logo alternada por tema
<img src={isDark ? logoLight : logoDark} alt="Elkys" />;
```

### Identidade hexagonal

```css
/* Clip path hexagonal — usado em masks e formas */
--hex-clip: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
```

### Convenção de cores no Tailwind

Todas as cores do Tailwind apontam para as CSS custom properties:

```ts
// tailwind.config.ts
colors: {
  primary: {
    DEFAULT: "hsl(var(--elk-primary))",
    foreground: "hsl(var(--elk-primary-foreground))",
    light: "hsl(var(--elk-primary-light))",
    dark: "hsl(var(--elk-primary-dark))",
    soft: "hsl(var(--elk-primary-soft))",
  },
  // ... secondary, accent, success, warning, destructive
  background: "hsl(var(--elk-background))",
  foreground: "hsl(var(--elk-foreground))",
  card: { DEFAULT: "hsl(var(--elk-card))", foreground: "hsl(var(--elk-card-foreground))" },
  muted: { DEFAULT: "hsl(var(--elk-muted))", foreground: "hsl(var(--elk-muted-foreground))" },
  border: "hsl(var(--elk-border))",
  input: "hsl(var(--elk-input))",
  ring: "hsl(var(--elk-ring))",
}
```

---

## 10. Animações

### Keyframes (Tailwind)

| Nome             | Descrição                   | Duração padrão             |
| ---------------- | --------------------------- | -------------------------- |
| `fade-in`        | Fade + slide up 20px        | `0.6s ease-out`            |
| `slide-up`       | Fade + slide up 30px        | `0.8s ease-out`            |
| `float`          | Flutuação vertical ±10px    | `3s ease-in-out infinite`  |
| `diamond-rotate` | Rotação suave ±8°           | `5s ease-in-out infinite`  |
| `hex-spin`       | Rotação 360° contínua       | `20s ease-in-out infinite` |
| `card-pulse`     | Escala + borda pulsante     | `3s cubic-bezier infinite` |
| `clients-scroll` | Scroll horizontal carrossel | `60s linear infinite`      |

### Classes utilitárias

```html
class="animate-fade-in"
<!-- entrada suave -->
class="animate-slide-up"
<!-- entrada com slide -->
class="animate-float"
<!-- flutua continuamente -->
class="animate-hex-spin"
<!-- rotação hexagonal -->
class="animate-card-pulse"
<!-- pulsa card -->
class="animate-clients-scroll"
<!-- scroll carrossel -->
```

### Efeitos SCSS (`_utilities.scss`)

**`btn-primary-animate`** — botão CTA com shine + lift:

- Pseudo-elemento shine: `left -100%` → `100%` em `0.5s`
- Hover: `translateY(-2px)` + shadow accent
- Active: `translateY(0)`

**`btn-secondary-animate`** — shine mais sutil (30% opacidade)

**`btn-arrow-animate`** — ícone de seta: `translateX(4px)` no hover do pai

**`hover-lift`** — `translateY(-2px)` genérico

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Responsividade

### Breakpoints

| Prefixo  | Largura mínima | Dispositivos alvo                               |
| -------- | -------------- | ----------------------------------------------- |
| _(base)_ | 0px            | Smartphones portrait                            |
| `xs`     | 475px          | Smartphones landscape / iPhones grandes         |
| `sm`     | 640px          | Tablets pequenos                                |
| `md`     | 768px          | Tablets portrait — **breakpoint principal**     |
| `lg`     | 1024px         | Tablets landscape / laptops — **sidebar ativa** |
| `xl`     | 1280px         | Desktops                                        |
| `2xl`    | 1536px         | Monitores grandes (max-w: 1400px)               |

### Padding do Container

| Breakpoint | Padding          |
| ---------- | ---------------- |
| base       | `1rem` (16px)    |
| `xs`       | `1.25rem` (20px) |
| `sm`       | `1.5rem` (24px)  |
| `md`       | `2rem` (32px)    |
| `lg`       | `2rem` (32px)    |
| `xl`       | `2.5rem` (40px)  |
| `2xl`      | `3rem` (48px)    |

### Padrões responsivos nos componentes

- **Grids:** 1 coluna (mobile) → 2 cols (md) → 3-4 cols (lg)
- **Sidebar:** oculta em mobile → fixa em lg+
- **Texto de inputs:** `text-base` → `md:text-sm` (evita zoom iOS)
- **HexAvatar hero:** `h-36 w-36` → `md:h-44 md:w-44`
- **Padding de Section:** `py-16` → `md:py-20` → `lg:py-24`

---

## 12. Acessibilidade

### Touch Targets (WCAG AAA)

Todos os elementos interativos garantem mínimo de **44×44px**:

```css
/* Button */
h-10 min-h-[44px]    /* default */
h-9  min-h-[44px]    /* sm */
h-11 min-h-[44px]    /* lg */
h-10 w-10 min-h-[44px] min-w-[44px]  /* icon */

/* Input / Textarea */
min-h-[44px]
```

### Focus Visible

Padrão aplicado a todos os elementos interativos:

```html
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

A cor do ring segue `--elk-ring` (roxo primário em light, mais claro em dark).

### Ícones

```tsx
// Decorativo (padrão) — invisível para screen readers
<Home size={20} />
// → aria-hidden="true" focusable="false"

// Semântico — lido por screen readers
<Home size={20} title="Início" />
// → role="img" aria-label="Início" focusable="false"

// Botão com ícone apenas
<Button variant="ghost" size="icon" aria-label="Fechar menu">
  <X />
</Button>
```

### Formulários

- `<Label>` com `htmlFor` vinculado ao `id` do input
- `<ErrorText role="alert">` — anunciado automaticamente por screen readers
- Placeholder distinto visualmente do valor preenchido

### AlertDialog

- `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` e `aria-describedby` vinculados aos textos
- Auto-focus no botão de confirmação
- Fechar com `Escape`
- Scroll lock no body

### Navegação do Portal

- Links ativos: `aria-current="page"`
- Botão de toggle sidebar: `aria-expanded={!collapsed}`
- Seções de nav: elementos `<nav>` com labels distintos

---

## 13. Utilitários

### `cn()`

Combina `clsx` + `tailwind-merge`. Resolve conflitos de classes Tailwind:

```tsx
import { cn } from "@/design-system";

// Merge seguro
cn("px-4 py-2", "px-6"); // → "py-2 px-6"
cn("text-primary", isActive && "text-accent");
cn(baseClasses, variant === "outline" && outlineClasses, className);
```

### Classes SCSS utilitárias

```html
<!-- Gradientes (via CSS vars) -->
class="bg-gradient-primary" class="bg-gradient-hero" class="bg-gradient-subtle"

<!-- Sombras de marca -->
class="shadow-elegant" class="shadow-glow" class="drop-shadow-glow"

<!-- Ícone de logo do cliente (grayscale → color no hover) -->
class="clients-logo-grayscale" class="clients-logo-wrapper"
<!-- wrapper com hover -->
```

---

> **Auditoria complementar 2026-04-23**: achados específicos de inconsistência (file:linha) e backlog de QOL para equipe/cliente estão em [`docs/AUDIT-2026-04-23.md`](AUDIT-2026-04-23.md). Este §14 permanece como regra canônica evergreen; o doc de auditoria é ponto-no-tempo.

## 14. Padronização — Auditoria 2026-04-22

Resultado da auditoria profunda feita em 2026-04-22 cobrindo **grids, status badges, autosave em forms, botões e sombras**. Esta seção é a fonte de verdade para divergências mapeadas e decisões de convergência. **Use-a como checklist** ao abrir PR em qualquer um desses eixos.

### 14.1 Grids — regra única

O primitivo `<Grid>` existe (§5.4) mas **tem 0 uso no codebase** — toda a UI usa Tailwind cru, gerando divergências de `gap` e `cols` entre páginas semelhantes.

**Padrão canônico por contexto:**

| Contexto                                | Cols                                        | Gap               | Observação                         |
| --------------------------------------- | ------------------------------------------- | ----------------- | ---------------------------------- |
| Landing / marketing (hero, about)       | `lg:grid-cols-2`                            | `gap-8 md:gap-12` | Par lado-a-lado                    |
| Cards de listagem pública (services)    | `md:grid-cols-2 lg:grid-cols-3`             | `gap-6 md:gap-8`  | Sem 4 cols                         |
| Features / process (4 itens)            | `md:grid-cols-2 lg:grid-cols-4`             | `gap-6`           | —                                  |
| KPI cards do admin (dashboards)         | `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` | `gap-3 sm:gap-4`  | Remover breakpoint `min-[400px]`   |
| KPI cards 4 métricas (Finance overview) | `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` | `gap-3 sm:gap-4`  | Único caso que permite 4           |
| Forms 2 colunas                         | `md:grid-cols-2`                            | `gap-4`           | **Nunca `gap-3` em form**          |
| Forms 3 colunas (compactos)             | `md:grid-cols-3`                            | `gap-4`           | —                                  |
| Tabelas custom (listagens admin)        | `grid-cols-[...fr...px]`                    | `gap-x-6 gap-y-3` | Manter template columns explícitas |

**Divergências conhecidas a corrigir:**

- `Finance.tsx` (KPI) usa `xl:grid-cols-3` e `xl:grid-cols-4` inconsistentes — unificar por qtd de métricas.
- `ClientCreate.tsx` mistura `gap-3 md:grid-cols-3` com `gap-4 md:grid-cols-2` — padronizar em `gap-4`.
- Breakpoint `min-[400px]` só aparece em admin KPI — **remover** em favor de `sm:`.

**Regra de uso do `<Grid>` primitive:** obrigatório para KPI grids e cards de listagem do portal. Liberado (mas recomendado) no resto.

### 14.2 Status Badges — fonte única de verdade

**Estado atual:** `StatusBadge` existe (§7.3), mas há 3 problemas:

1. Duplicação de tom dentro do mesmo domínio (Leads: `diagnostico` e `proposta` ambos `primary`).
2. Label divergente entre admin e cliente para o mesmo status (contrato `em_validacao` = "Em validação" no admin vs "Aguardando seu aceite" no cliente).
3. Badges ad-hoc inline (ex: `ContractAcceptanceStatusCard`, `Support.tsx`) usando `bg-warning/10 text-warning` sem passar pelo componente.

**Regra canônica de tones por semântica:**

| Semântica           | Tone          | Uso típico                                |
| ------------------- | ------------- | ----------------------------------------- |
| Neutro / rascunho   | `secondary`   | `rascunho`, `novo`, `fechado`             |
| Em progresso / info | `accent`      | `em_andamento`, `enviada`, `qualificado`  |
| Aguardando ação     | `warning`     | `em_validacao`, `pausado`, `negociacao`   |
| Sucesso / final OK  | `success`     | `concluido`, `aprovada`, `ativo`, `ganho` |
| Falha / bloqueio    | `destructive` | `cancelado`, `rejeitada`, `perdido`       |
| Atenção passiva     | `primary`     | reservado para destaques de marca (raros) |

**Mapas unificados** vivem em `src/lib/portal.ts` como `PROJECT_STATUS_META`, `LEAD_STATUS_META`, `PROPOSAL_STATUS_META`, `CONTRACT_STATUS_META`, `TICKET_STATUS_META`. Labels **admin** e **cliente** podem diferir — usar `label` e `labelClient` no mesmo objeto.

**Indicadores adjacentes** (estilo linha-de-listagem, dot colorido + texto) seguem uma variante distinta — componentizar como `<IndicatorBadge>` em `portal/shared/` (usa `border-{tone}/30 bg-{tone}/10 text-{tone}`) para não sobrepor `StatusBadge`. Hoje `ClientRowIndicators.tsx` já usa esse padrão mas não está extraído.

### 14.3 Autosave em Forms — padrão único

**Estado atual (pós-evolução do hook):** `useFormDraftAutoSave` já suporta dois modos:

- `autoRestore: true` (legado): restaura rascunho silenciosamente no mount — `ProjectCreate`, `Notifications`.
- `autoRestore: false`: expõe `hasDraft`, `restore()`, `discard()` para UI escolher restaurar.

`<DraftBanner>` (`portal/shared/DraftBanner.tsx`) é o componente canônico para o **modo banner** — mostra "Temos um rascunho salvo" + ações Restaurar/Descartar.

**O que ainda falta:** um indicador **em tempo real** (`idle`/`pending`/`saving`/`saved`/`error`) visível durante a digitação. `DraftBanner` cobre só o momento de montagem. `ProjectCreate` tem um `<DraftStatus>` inline não-reutilizável que deveria virar `<AutosaveIndicator>`.

**Padrão oficial:**

1. **Hook**: `useFormDraftAutoSave` (já existe). Em forms novos **preferir `autoRestore: false`** + `<DraftBanner>` — é menos invasivo para o usuário.
2. **Server autosave**: não existe no hook ainda. Quando precisar (forms financeiros), compor `useFormDraftAutoSave` com `useMutation` do React Query dentro do componente — hook não precisa inchar.
3. **Indicador em tempo real**: criar `<AutosaveIndicator state lastSavedAt error />` em `portal/shared/` (pendente):
   - `idle` → oculto
   - `pending` (isPending=true) → dot amber pulsante + "Rascunho aguardando..."
   - `saving` → dot amber spin + "Salvando..."
   - `saved` (savedAt preenchido, !isPending) → dot success + "Salvo às HH:MM"
   - `error` → dot destructive + botão "Tentar novamente"
4. **Quando usar autosave:**
   - Multi-step (>2 etapas) → **sempre** (localStorage com `DraftBanner`)
   - Form longo (>8 campos) → localStorage draft via banner
   - Form financeiro (valores R$) → localStorage + servidor com retry
   - Form curto (<5 campos) → **não** autosave, só submit

**Alvos de refactor prioritários:** `ClientCreate` (onboarding multi-step sem autosave), `ExpenseCreate` (financeiro), `ClientDetail` (seções editáveis). `ProjectCreate` pode migrar do `DraftStatus` inline para `<AutosaveIndicator>` quando este existir.

### 14.4 Botões — hierarquia e uso

Componente `<Button>` do DS (§4.1) é sólido — problema é uso.

**Auditoria:** 106 `<button>` no src; ~70 via DS, ~36 crus. Divergências recorrentes:

- Menu toggles com `p-2 min-h-[44px] min-w-[44px]` duplicando padding do DS (`Navigation.tsx:359`).
- Icon buttons em tabelas/dropdowns usando `h-8 w-8` em vez de `size="icon"` (`RowActionMenu.tsx:32`).
- Ícone-only sem `aria-label` (`Tasks.tsx:580, 963`, `MarketingCalendar.tsx:2100`).
- Close buttons ad-hoc (`CookieConsent.tsx:105`, `Login.tsx:204` toggle senha).
- Botões de carrossel (`Testimonials.tsx:305, 385`) com classes próprias.

**Hierarquia canônica de CTA:**

| Camada              | Variante              | Onde usar                                    |
| ------------------- | --------------------- | -------------------------------------------- |
| CTA principal Hero  | `gradient`            | Navbar "Fale Conosco", hero CTA de conversão |
| CTA secundário Hero | `accent` (ciano)      | WhatsApp, call-to-actions alternativos       |
| CTA hero em escuro  | `hero_outline`        | Botões sobre `gradient-hero`                 |
| Ação principal app  | `default`             | Submit, salvar, confirmar (portal)           |
| Suporte             | `secondary`/`outline` | Cancelar, voltar, alternar                   |
| Navegação / ícones  | `ghost`               | Menu, dropdowns, ações de linha              |
| Destrutiva          | `destructive`         | Excluir, cancelar projeto                    |
| Inline em texto     | `link`                | Links que parecem texto                      |

**Regras:**

- `<button>` HTML cru só é aceitável dentro de componentes highly custom (carrossel, editor). Em qualquer outro contexto → DS.
- Icon-only **sempre** requer `aria-label`. Criar ESLint rule (`jsx-a11y/control-has-associated-label`) já presente — ativar strict.
- Nunca duplicar `p-2` quando `size="icon"` já define 44×44.
- Links de react-router estilizados como botão: `<Link className={buttonVariants({ variant, size })}>` (padrão consistente, 15+ usos).

### 14.5 Sombras — escala de elevação

Tokens já existem (§2.4) mas uso é incoerente — shadows duplas em Card, dropdowns com tokens diferentes, drop-shadow hardcoded em hex.

**Escala oficial de elevação (nomear por função, não por tamanho):**

| Token                | Mapeamento atual           | Uso                                          |
| -------------------- | -------------------------- | -------------------------------------------- |
| `shadow-elevation-0` | sem shadow                 | Surface plana (`bg-card` sobre `background`) |
| `shadow-elevation-1` | `shadow-sm` / `card`       | Card inativo, botão base                     |
| `shadow-elevation-2` | `shadow-md` / `card-hover` | Card hover, botão hover                      |
| `shadow-elevation-3` | `shadow-lg`                | Dropdowns, popovers, notification bell       |
| `shadow-elevation-4` | `shadow-xl`                | Modais, AlertDialog, drawers                 |
| `shadow-brand-md`    | `shadow-primary`           | Botões `gradient`, CTA hero                  |
| `shadow-brand-lg`    | `shadow-primary-lg`        | Hover de CTAs de marca                       |

**Regras:**

- `<Card>` do DS **já aplica** `shadow-card` + `hover:shadow-card-hover`. **Nunca** sobrepor `shadow-xl`/`shadow-2xl` em `<Card className>` — se precisa de elevação maior, é porque o uso é modal → use `AlertDialog` ou um `<div>` próprio.
- Dropdowns do portal padronizados em `shadow-elevation-3` (= `shadow-lg`). Corrigir `Navigation.tsx:248,304` (estava em `shadow-xl`).
- **Proibido** `drop-shadow-[...rgba(...)]` com cor hex — usar `hsl(var(--elk-primary) / alpha)`. Corrigir `NotFound.tsx:64`.
- `shadow-brand-*` reservado para elementos de marca; não usar em botões default/secondary.
- Dark mode: não adicionar overrides manuais — tokens em `_tokens.scss` já tratam opacity.

### 14.6 Plano de execução (ordem sugerida)

1. **Docs** (concluído nesta versão): esta seção 14 + atualização do CLAUDE.md.
2. **Extração de componentes faltantes:** `<AutosaveIndicator>`, `<IndicatorBadge>`.
3. **Refactor de hook:** evoluir `useFormDraftAutoSave` → `useFormAutosave` mantendo API retrocompatível.
4. **Correções de baixo risco:** `Navigation` dropdowns → `shadow-lg`; `NotFound` drop-shadow → HSL; `aria-label` nos icon-only (`Tasks`, `MarketingCalendar`).
5. **Unificação status:** migrar badges ad-hoc em `ContractAcceptanceStatusCard` e `Support.tsx` para `<StatusBadge>`.
6. **Grids:** padronizar KPI cards (Finance/Overview) e forms (ClientCreate).
7. **Autosave:** aplicar em `ClientCreate`, `ExpenseCreate`, `ClientDetail`.

Cada item vira um commit separado seguindo git-flow (`bugfix/ds-*` ou `feat/ds-*`).

---

## Referência rápida

```tsx
// Design system completo
import {
  // Componentes
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Textarea,
  AlertDialog,
  HexAvatar,
  HexPattern,
  Toaster,
  // Primitivos
  Container,
  Section,
  Stack,
  Grid,
  // Formulário
  Label,
  Field,
  ErrorText,
  // Util
  cn,
} from "@/design-system";

// Ícones
import {
  // Navegação
  Home,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
  // Interface
  Eye,
  Search,
  Cog,
  FileText,
  Folder,
  ExternalLink,
  Send,
  // Negócios
  Building2,
  Users,
  Target,
  TrendingUp,
  BarChart,
  Clock,
  CheckCircle,
  // Financeiro
  Banknote,
  PiggyBank,
  Wallet,
  HandCoins,
  Receipt,
  // Suporte
  Headphones,
  Phone,
  Mail,
  // Dev
  Code,
  Code2,
  Blueprint,
  Network,
  // Proprietary Elkys
  Agile,
  AgileMono,
  AgileFill,
  Suporte,
  SuporteMono,
  SuporteFill,
  // Tema
  Sun,
  Moon,
  // Social
  Github,
  Instagram,
  Linkedin,
} from "@/assets/icons";
import type { IconProps } from "@/assets/icons";

// Portal
import MetricTile from "@/components/portal/MetricTile";
import AdminMetricCard from "@/components/portal/AdminMetricCard";
import StatusBadge from "@/components/portal/StatusBadge";
import type { MetricTone } from "@/components/portal/MetricTile";
```
