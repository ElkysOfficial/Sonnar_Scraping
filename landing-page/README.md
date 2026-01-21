# Sonnar Landing Page

Site institucional de uma página para o Sonnar - plataforma de vagas de emprego personalizadas via Discord e WhatsApp.

## Stack

- Vue.js 3 (Composition API)
- Vite
- CSS puro com design tokens (CSS Variables)

## Instalação

```bash
cd landing-page
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Acesse http://localhost:3000

## Build para produção

```bash
npm run build
```

Os arquivos estáticos serão gerados na pasta `dist/`.

## Preview do build

```bash
npm run preview
```

## Estrutura

```
landing-page/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   │   └── styles.css      # Design tokens e estilos globais
│   ├── components/
│   │   ├── AppHeader.vue
│   │   ├── HeroSection.vue
│   │   ├── HowItWorksSection.vue
│   │   ├── BenefitsSection.vue
│   │   ├── PricingSection.vue
│   │   ├── TestimonialsSection.vue
│   │   ├── FaqSection.vue
│   │   ├── ContactSection.vue
│   │   └── AppFooter.vue
│   ├── App.vue
│   └── main.js
├── index.html
├── package.json
└── vite.config.js
```

## Paleta de cores

| Token | Hex | Uso |
|-------|-----|-----|
| Primary | #1E5BFF | Cor principal da marca |
| Primary Dark | #1747CC | Hover em elementos primários |
| Primary Soft | #EAF1FF | Backgrounds suaves |
| Background | #F8FAFF | Fundo da página |
| Surface | #FFFFFF | Cards e superfícies |
| CTA Accent | #00B7FF | Botões de conversão |

## Features

- Responsivo mobile-first
- Scroll suave entre seções
- Animações de entrada (fade/slide)
- Acessibilidade (ARIA labels, navegação por teclado)
- SEO otimizado (meta tags, JSON-LD)
- Formulário de solicitação de acesso
- FAQ com accordion
