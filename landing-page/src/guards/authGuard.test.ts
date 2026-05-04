import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dos singletons reativos. vi.mock é hoisted; objetos retornados ficam
// como o módulo real e a gente muta `.value` por teste.
vi.mock('@/composables/useAuth', () => ({
  session: { value: null as unknown },
  userRole: { value: null as unknown },
  subscriber: { value: null as unknown },
  roleStatus: { value: 'idle' as unknown },
  bootAuth: vi.fn(() => Promise.resolve())
}))

import { globalAuthGuard } from './authGuard'
import { session, userRole, subscriber, roleStatus } from '@/composables/useAuth'

type Route = {
  path: string
  fullPath: string
  meta: Record<string, unknown>
  query: Record<string, unknown>
  hash: string
  params: Record<string, unknown>
  matched: unknown[]
  name: string | null
  redirectedFrom: undefined
}

function makeRoute(path: string, meta: Record<string, unknown> = {}, fullPath?: string): Route {
  return {
    path,
    fullPath: fullPath ?? path,
    meta,
    query: {},
    hash: '',
    params: {},
    matched: [],
    name: null,
    redirectedFrom: undefined
  }
}

const FROM = makeRoute('/')

describe('globalAuthGuard', () => {
  let next: ReturnType<typeof vi.fn>

  beforeEach(() => {
    next = vi.fn()
    ;(session as { value: unknown }).value = null
    ;(userRole as { value: unknown }).value = null
    ;(subscriber as { value: unknown }).value = null
    ;(roleStatus as { value: unknown }).value = 'idle'
  })

  // ============================================================
  // Rotas públicas sem meta
  // ============================================================
  describe('rota pública sem meta', () => {
    it('deixa anônimo passar', async () => {
      await globalAuthGuard(makeRoute('/') as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })
    it('deixa autenticado passar', async () => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
      ;(userRole as { value: unknown }).value = 'client'
      await globalAuthGuard(makeRoute('/termos') as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ============================================================
  // publicOnly (login, signup) — bloqueia se já autenticado
  // ============================================================
  describe('publicOnly + autenticado', () => {
    beforeEach(() => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
    })

    it('owner → /admin', async () => {
      ;(userRole as { value: unknown }).value = 'owner'
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/admin')
    })
    it('admin → /admin', async () => {
      ;(userRole as { value: unknown }).value = 'admin'
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/admin')
    })
    it('cliente sem pagamento pendente → /dashboard', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'free', status: 'active' }
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/dashboard')
    })
    it('cliente com pagamento pendente → /pagar', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'pro', status: 'pending' }
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/pagar')
    })
    it('autenticado sem role com erro transitório → next() + dispatch transient-error', async () => {
      ;(roleStatus as { value: unknown }).value = 'transient-error'
      const handler = vi.fn()
      window.addEventListener('auth-no-access', handler as EventListener)
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
      expect(handler).toHaveBeenCalled()
      const ev = handler.mock.calls[0][0] as CustomEvent
      expect(ev.detail).toEqual({ reason: 'transient-error' })
      window.removeEventListener('auth-no-access', handler as EventListener)
    })
    it('autenticado sem role e sem erro transitório → next() + dispatch no-role', async () => {
      ;(roleStatus as { value: unknown }).value = 'no-role'
      const handler = vi.fn()
      window.addEventListener('auth-no-access', handler as EventListener)
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
      const ev = handler.mock.calls[0][0] as CustomEvent
      expect(ev.detail).toEqual({ reason: 'no-role' })
      window.removeEventListener('auth-no-access', handler as EventListener)
    })
  })

  describe('publicOnly + anônimo', () => {
    it('passa direto (deixa o usuário ver login/signup)', async () => {
      await globalAuthGuard(makeRoute('/login', { publicOnly: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ============================================================
  // requiresAuth — anônimo é redirecionado pra /login com intended route
  // ============================================================
  describe('requiresAuth + anônimo', () => {
    it('preserva fullPath via ?redirect=', async () => {
      await globalAuthGuard(
        makeRoute('/dashboard/configuracoes', { requiresAuth: true }, '/dashboard/configuracoes') as any,
        FROM as any,
        next as any
      )
      expect(next).toHaveBeenCalledWith({
        path: '/login',
        query: { redirect: '/dashboard/configuracoes' }
      })
    })
    it('rota raiz `/` não vira query (evita redundância)', async () => {
      await globalAuthGuard(
        makeRoute('/', { requiresAuth: true }, '/') as any,
        FROM as any,
        next as any
      )
      expect(next).toHaveBeenCalledWith({ path: '/login', query: {} })
    })
    it('fullPath malicioso (//evil) é sanitizado por safeRedirect', async () => {
      await globalAuthGuard(
        makeRoute('/x', { requiresAuth: true }, '//evil.com') as any,
        FROM as any,
        next as any
      )
      expect(next).toHaveBeenCalledWith({ path: '/login', query: {} })
    })
  })

  // ============================================================
  // requiresAuth + autenticado
  // ============================================================
  describe('requiresAuth + autenticado', () => {
    beforeEach(() => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
    })

    it('cliente free active → next()', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'free', status: 'active' }
      await globalAuthGuard(makeRoute('/dashboard/vagas', { requiresAuth: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })

    it('cliente pro pending em /dashboard → /pagar', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'pro', status: 'pending' }
      await globalAuthGuard(makeRoute('/dashboard/vagas', { requiresAuth: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/pagar')
    })

    it('staff em /dashboard é mandado pra /admin', async () => {
      ;(userRole as { value: unknown }).value = 'admin'
      await globalAuthGuard(makeRoute('/dashboard/vagas', { requiresAuth: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/admin')
    })

    it('sem role (no-role) → next("/") + dispatch no-role, sem signOut', async () => {
      ;(roleStatus as { value: unknown }).value = 'no-role'
      const handler = vi.fn()
      window.addEventListener('auth-no-access', handler as EventListener)
      await globalAuthGuard(makeRoute('/dashboard/vagas', { requiresAuth: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/')
      const ev = handler.mock.calls[0][0] as CustomEvent
      expect(ev.detail).toEqual({ reason: 'no-role' })
      window.removeEventListener('auth-no-access', handler as EventListener)
    })

    it('sem role com transient-error → next("/") + dispatch reason transient', async () => {
      ;(roleStatus as { value: unknown }).value = 'transient-error'
      const handler = vi.fn()
      window.addEventListener('auth-no-access', handler as EventListener)
      await globalAuthGuard(makeRoute('/dashboard/vagas', { requiresAuth: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/')
      const ev = handler.mock.calls[0][0] as CustomEvent
      expect(ev.detail).toEqual({ reason: 'transient-error' })
      window.removeEventListener('auth-no-access', handler as EventListener)
    })
  })

  // ============================================================
  // requiresAdmin
  // ============================================================
  describe('requiresAdmin', () => {
    beforeEach(() => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
    })

    it('cliente → /dashboard', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'free', status: 'active' }
      await globalAuthGuard(makeRoute('/admin', { requiresAdmin: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/dashboard')
    })

    it('admin → next()', async () => {
      ;(userRole as { value: unknown }).value = 'admin'
      await globalAuthGuard(makeRoute('/admin', { requiresAdmin: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })

    it('owner → next()', async () => {
      ;(userRole as { value: unknown }).value = 'owner'
      await globalAuthGuard(makeRoute('/admin', { requiresAdmin: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ============================================================
  // requiresOwner
  // ============================================================
  describe('requiresOwner', () => {
    beforeEach(() => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
    })

    it('admin não-owner → /admin', async () => {
      ;(userRole as { value: unknown }).value = 'admin'
      await globalAuthGuard(
        makeRoute('/admin/admins', { requiresAdmin: true, requiresOwner: true }) as any,
        FROM as any,
        next as any
      )
      expect(next).toHaveBeenCalledWith('/admin')
    })

    it('owner → next()', async () => {
      ;(userRole as { value: unknown }).value = 'owner'
      await globalAuthGuard(
        makeRoute('/admin/admins', { requiresAdmin: true, requiresOwner: true }) as any,
        FROM as any,
        next as any
      )
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ============================================================
  // requiresPaymentPending
  // ============================================================
  describe('requiresPaymentPending', () => {
    beforeEach(() => {
      ;(session as { value: unknown }).value = { user: { id: 'u1' } }
    })

    it('staff → /admin', async () => {
      ;(userRole as { value: unknown }).value = 'admin'
      await globalAuthGuard(makeRoute('/pagar', { requiresPaymentPending: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/admin')
    })

    it('cliente sem pagamento pendente → /dashboard', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'free', status: 'active' }
      await globalAuthGuard(makeRoute('/pagar', { requiresPaymentPending: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/dashboard')
    })

    it('cliente plano pago active → /dashboard', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'pro', status: 'active' }
      await globalAuthGuard(makeRoute('/pagar', { requiresPaymentPending: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith('/dashboard')
    })

    it('cliente plano pago pending → next()', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'pro', status: 'pending' }
      await globalAuthGuard(makeRoute('/pagar', { requiresPaymentPending: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })

    it('cliente past_due → next()', async () => {
      ;(userRole as { value: unknown }).value = 'client'
      ;(subscriber as { value: unknown }).value = { plan: 'plus', status: 'past_due' }
      await globalAuthGuard(makeRoute('/pagar', { requiresPaymentPending: true }) as any, FROM as any, next as any)
      expect(next).toHaveBeenCalledWith()
    })
  })
})
