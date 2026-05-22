import { createRouter, createWebHistory } from 'vue-router'
import { globalAuthGuard } from '../guards/authGuard'

// Lazy loading das páginas
const HomePage = () => import('../pages/HomePage.vue')
const SignupPage = () => import('../pages/SignupPage.vue')
const LoginPage = () => import('../pages/LoginPage.vue')
const ForgotPasswordPage = () => import('../pages/ForgotPasswordPage.vue')
const ChangePasswordPage = () => import('../pages/ChangePasswordPage.vue')
const PaymentPendingPage = () => import('../pages/PaymentPendingPage.vue')
const PaymentConfirmingPage = () => import('../pages/PaymentConfirmingPage.vue')
const DashboardLayout = () => import('../pages/dashboard/DashboardLayout.vue')
const DashboardJobs = () => import('../pages/dashboard/DashboardJobs.vue')
const DashboardSubscription = () => import('../pages/dashboard/DashboardSubscription.vue')
const DashboardSettings = () => import('../pages/dashboard/DashboardSettings.vue')
const AdminLayout = () => import('../pages/AdminLayout.vue')
const AdminDashboard = () => import('../pages/AdminDashboard.vue')
const AdminSubscribers = () => import('../pages/AdminSubscribers.vue')
const AdminNewClient = () => import('../pages/AdminNewClient.vue')
const AdminManageAdmins = () => import('../pages/AdminManageAdmins.vue')
const AdminScraper = () => import('../pages/AdminScraper.vue')
const AdminEngineDrilldown = () => import('../pages/AdminEngineDrilldown.vue')
const TermsPage = () => import('../pages/TermsPage.vue')
const PrivacyPage = () => import('../pages/PrivacyPage.vue')
const CookiesPage = () => import('../pages/CookiesPage.vue')
const NotFoundPage = () => import('../pages/NotFoundPage.vue')

const routes = [
  { path: '/', name: 'Home', component: HomePage },
  {
    path: '/cadastro/:plan?',
    name: 'Signup',
    component: SignupPage,
    props: route => ({ plan: route.params.plan || null }),
    meta: { publicOnly: true }
  },
  { path: '/login', name: 'Login', component: LoginPage, meta: { publicOnly: true } },
  { path: '/redefinir-senha', name: 'ForgotPassword', component: ForgotPasswordPage, meta: { publicOnly: true } },
  // Fluxo legado de verificação por código (removido). Confirmação é feita pelo Supabase Auth.
  { path: '/verificar-email', redirect: '/login' },
  // Aliases legados - Stripe success_url antigo apontava pra cá.
  { path: '/pagamento-sucesso', redirect: '/pagamento/confirmando' },
  { path: '/pagamento/confirmando', name: 'PaymentConfirming', component: PaymentConfirmingPage },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: ChangePasswordPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/pagar',
    name: 'PaymentPending',
    component: PaymentPendingPage,
    meta: { requiresPaymentPending: true }
  },
  {
    path: '/dashboard',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard/vagas' },
      {
        path: 'vagas',
        name: 'DashboardJobs',
        component: DashboardJobs,
        meta: { title: 'Vagas pra você', subtitle: 'Filtradas pelo seu perfil de busca.' }
      },
      {
        path: 'assinatura',
        name: 'DashboardSubscription',
        component: DashboardSubscription,
        meta: { title: 'Assinatura', subtitle: 'Gerencie seu plano e cobrança.' }
      },
      {
        path: 'configuracoes',
        name: 'DashboardSettings',
        component: DashboardSettings,
        meta: { title: 'Configurações', subtitle: 'Ajuste sua conta e perfil de busca.' }
      }
    ]
  },
  { path: '/termos', name: 'Terms', component: TermsPage },
  { path: '/privacidade', name: 'Privacy', component: PrivacyPage },
  { path: '/cookies', name: 'Cookies', component: CookiesPage },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAdmin: true },
    children: [
      {
        path: '', name: 'AdminDashboard', component: AdminDashboard,
        meta: { title: 'Visão Geral', subtitle: 'Resumo da operação: assinantes, MRR, crescimento e coleta.' }
      },
      {
        path: 'subscribers', name: 'AdminSubscribers', component: AdminSubscribers,
        meta: { title: 'Lista de Assinantes', subtitle: 'Gerencie todos os clientes ativos e em trial.' }
      },
      {
        path: 'new-client', name: 'AdminNewClient', component: AdminNewClient,
        meta: { title: 'Novo Cliente', subtitle: 'Adicione manualmente um cliente no sistema.' }
      },
      {
        path: 'admins', name: 'AdminManageAdmins', component: AdminManageAdmins,
        meta: { requiresOwner: true, title: 'Administradores', subtitle: 'Conceda ou revogue acesso administrativo.' }
      },
      {
        path: 'scraper', name: 'AdminScraper', component: AdminScraper,
        meta: { title: 'Coleta de Vagas', subtitle: 'Como o sistema está buscando vagas nos sites parceiros.' }
      },
      {
        path: 'scraper/engine/:engine',
        name: 'AdminEngineDrilldown',
        component: AdminEngineDrilldown,
        meta: { title: 'Drill-down por engine', subtitle: 'Métricas, eventos e histórico de proteção da engine selecionada.' }
      }
    ]
  },
  // Catch-all: renderiza 404 explícito pro usuário entender que a rota não
  // existe (anti silent-redirect). NotFoundPage tem CTAs pra voltar à home
  // ou à página anterior.
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundPage }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (to.hash) {
      const el = typeof document !== 'undefined' ? document.querySelector(to.hash) : null
      if (el) return { el: to.hash, behavior: 'smooth' }
      return { top: 0 }
    }
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

// Guard global único - fonte única de verdade pra autorização.
// Aguarda bootAuth() (idempotente) antes de qualquer decisão, eliminando
// race conditions no refresh.
router.beforeEach(globalAuthGuard)

// Resiliência a deploy: as páginas são lazy-loaded por chunks com hash no
// nome. Quando um deploy novo troca os hashes, uma aba já aberta ainda tem
// em memória o index.html antigo e tenta importar chunks que não existem
// mais (404 -> "Failed to fetch dynamically imported module"). Em vez de
// deixar a navegação travada, recarregamos a página uma vez: como o
// index.html é servido com no-cache, o reload traz os hashes atuais.
const CHUNK_RELOAD_KEY = 'sonnar:chunk-reload'
router.onError((error, to) => {
  const msg = String(error && error.message)
  const isChunkError =
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg)
  if (!isChunkError) return

  const target = (to && to.fullPath) || window.location.pathname
  try {
    // Guarda contra loop: se o reload já foi tentado pra este destino e o
    // chunk ainda falha, é um problema real de deploy — não recarrega de novo.
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === target) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, target)
  } catch { /* sem sessionStorage: segue e recarrega mesmo assim */ }

  window.location.assign(target)
})

router.afterEach(() => {
  // Navegou com sucesso: libera nova tentativa de reload para o próximo deploy.
  try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* no-op */ }
})

export default router
