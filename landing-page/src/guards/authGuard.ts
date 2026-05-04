import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { bootAuth, session, userRole, subscriber, roleStatus } from '@/composables/useAuth'
import { safeRedirect } from '@/utils/safeRedirect'

type Plan = 'free' | 'pro' | 'plus'
type Status = 'active' | 'pending' | 'past_due' | 'canceled'

// Cliente em plano pago precisa estar 'active' (Stripe trial entra como active no webhook).
function needsPayment(): boolean {
  if (userRole.value !== 'client') return false
  const plan = subscriber.value?.plan as Plan | undefined
  const status = subscriber.value?.status as Status | undefined
  if (!plan || plan === 'free') return false
  return status !== 'active'
}

function loginRedirect(to: RouteLocationNormalized) {
  // Preserva a rota pretendida (path + query + hash). Sanitização anti
  // open-redirect e anti header-injection centralizada em utils/safeRedirect.
  const sanitized = safeRedirect(to.fullPath)
  return {
    path: '/login',
    query: sanitized && sanitized !== '/' ? { redirect: sanitized } : {}
  }
}

function dispatchNoAccess(reason: 'no-role' | 'transient-error') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('auth-no-access', { detail: { reason } }))
}

/**
 * Guard global. Roda em TODA navegação. Aguarda bootAuth (idempotente)
 * pra garantir que session/userRole/subscriber estão hidratados antes
 * de decidir qualquer redirect — elimina race conditions no refresh.
 *
 * Política para sessão válida sem papel:
 *   - 'no-role'         → role confirmadamente ausente: dispara auth-no-access
 *                         e manda pra home (NÃO derruba sessão).
 *   - 'transient-error' → falha de rede/timeout: dispara auth-no-access com
 *                         reason transient e manda pra home; sessão preservada.
 */
export async function globalAuthGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  await bootAuth()

  const isAuth = !!session.value
  const role = userRole.value
  const isStaff = role === 'admin' || role === 'owner'

  const meta = to.meta as {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    requiresOwner?: boolean
    requiresPaymentPending?: boolean
    publicOnly?: boolean
  }

  // Rota pública restrita a anônimos (login/cadastro): se já autenticado,
  // redireciona pro destino correto (admin/dashboard/pagar).
  if (meta.publicOnly && isAuth) {
    if (isStaff) return next('/admin')
    if (needsPayment()) return next('/pagar')
    // Se não temos role mas a sessão é válida, deixa entrar na rota pública
    // (não tranca o usuário). UI mostra toast via auth-no-access.
    if (role) return next('/dashboard')
    dispatchNoAccess(roleStatus.value === 'transient-error' ? 'transient-error' : 'no-role')
    return next()
  }

  // Rotas protegidas
  if (meta.requiresAuth || meta.requiresAdmin || meta.requiresOwner || meta.requiresPaymentPending) {
    if (!isAuth) return next(loginRedirect(to))

    if (!role) {
      // Sessão é válida — não fazemos signOut. Sinalizamos pra UI e
      // mandamos pra home, onde o usuário vê o toast e decide o que fazer.
      dispatchNoAccess(roleStatus.value === 'transient-error' ? 'transient-error' : 'no-role')
      return next('/')
    }

    if (meta.requiresOwner && role !== 'owner') return next('/admin')
    if (meta.requiresAdmin && !isStaff) return next('/dashboard')

    if (meta.requiresPaymentPending) {
      if (isStaff) return next('/admin')
      if (!needsPayment()) return next('/dashboard')
      return next()
    }

    // requiresAuth padrão (área do cliente)
    if (meta.requiresAuth) {
      if (isStaff && to.path.startsWith('/dashboard')) return next('/admin')
      if (needsPayment() && !to.path.startsWith('/pagar')) return next('/pagar')
    }
  }

  return next()
}
