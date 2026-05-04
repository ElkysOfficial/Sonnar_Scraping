# SonnarJobs

Plataforma de vagas de emprego para profissionais de tecnologia.

## Tecnologias

- **Vue 3** - Framework JavaScript progressivo
- **Vite** - Build tool e dev server
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Framework CSS utilitário
- **Ant Design Vue** - Biblioteca de componentes UI
- **Supabase** - Backend as a Service (autenticação e banco de dados)
- **Vue Router** - Roteamento SPA

## Requisitos

- Node.js 18+
- npm ou bun

## Instalação

```bash
# Clonar o repositório
git clone <URL_DO_REPOSITORIO>

# Entrar no diretório
cd sonnarjobs

# Instalar dependências
npm install

# Copiar arquivo de ambiente
cp .env.example .env

# Configurar variáveis de ambiente no arquivo .env
```

## Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
npm run dev

# Executar linting
npm run lint

# Executar testes
npm run test
```

## Build

```bash
# Build de produção
npm run build

# Preview do build
npm run preview
```

## Estrutura do Projeto

```
src/
├── components/     # Componentes Vue reutilizáveis
├── pages/          # Páginas/views da aplicação
├── router/         # Configuração de rotas
├── guards/         # Guards de navegação (auth, admin)
├── composables/    # Composables Vue (hooks)
├── integrations/   # Integrações externas (Supabase)
├── utils/          # Funções utilitárias
├── assets/         # Arquivos estáticos (CSS, imagens)
└── test/           # Configuração de testes
```

## Deploy

O projeto está configurado para deploy em plataformas como Netlify ou Vercel.

Certifique-se de configurar as variáveis de ambiente:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Licença

Propriedade de SonnarJobs. Todos os direitos reservados.
