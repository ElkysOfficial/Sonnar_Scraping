import { ref, computed, readonly } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

type SubscriberRow = Database['public']['Tables']['subscribers']['Row']
type AppRole = 'owner' | 'admin' | 'client' | null
type RoleStatus = 'idle' | 'loading' | 'ready' | 'no-role' | 'transient-error'

// ======================================================
// Singleton state - sobrevive a re-renders/HMR
// ======================================================
const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const loading = ref(true)
const isInitialized = ref(false)
const userRole = ref<AppRole>(null)
const subscriber = ref<SubscriberRow | null>(null)
// Estado de hidratação de role - guard usa pra distinguir "sem permissão"
// (no-role) de "falha transitória de rede" (transient-error).
const roleStatus = ref<RoleStatus>('idle')

// Bootstrap: o owner pode logar mesmo sem entrada em user_roles.
// Garante recuperação de acesso após reset do banco. Configurável via
// VITE_OWNER_EMAIL - se ausente/vazio, o bootstrap por e-mail é
// desabilitado e o owner precisa estar em user_roles como qualquer outro.
const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL ?? '').trim().toLowerCase()

// ======================================================
// Mensagens humanizadas - nunca vazar erro técnico do Supabase.
// Exportada para testes; consumidores fora deste módulo devem usar
// signInWithEmail / sendPasswordReset que já aplicam internamente.
// ======================================================
export function humanizeAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.'
  }
  if (m.includes('user not found')) {
    return 'Não encontramos uma conta com esse e-mail.'
  }
  if (m.includes('network') || m.includes('failed to fetch')) {
    return 'Sem conexão com o servidor. Verifique sua internet.'
  }
  return 'Não foi possível concluir a operação. Tente novamente.'
}

// ======================================================
// Helpers de rede: timeout + classificação de erro
// ======================================================
class TimeoutError extends Error {
  constructor() { super('timeout'); this.name = 'TimeoutError' }
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new TimeoutError()), ms)
    Promise.resolve(p).then(
      v => { window.clearTimeout(t); resolve(v) },
      e => { window.clearTimeout(t); reject(e) }
    )
  })
}

function isAbort(err: unknown): boolean {
  const e = err as { name?: string }
  return e?.name === 'AbortError'
}

function isTimeout(err: unknown): boolean {
  return err instanceof TimeoutError
}

// ======================================================
// Determina o papel do usuário consultando user_roles + subscribers.
// Retorna { ok, reason } pra que callers decidam o que fazer com cada caso:
//   - 'no-session'      → user/session ausente
//   - 'no-role'         → confirmadamente sem papel no banco (RBAC)
//   - 'transient-error' → falha de rede/timeout/abort (não bloquear acesso)
// ======================================================
type FetchRoleResult =
  | { ok: true }
  | { ok: false; reason: 'no-session' | 'no-role' | 'transient-error' }

const ROLE_TIMEOUTS_MS = [8000, 12000] as const

async function fetchUserRole(): Promise<FetchRoleResult> {
  const u = user.value
  if (!u?.id) {
    userRole.value = null
    subscriber.value = null
    roleStatus.value = 'idle'
    return { ok: false, reason: 'no-session' }
  }

  roleStatus.value = 'loading'

  // Bootstrap owner por e-mail - funciona mesmo se user_roles estiver vazia
  // (ex.: pós-reset de banco). Só ativa se VITE_OWNER_EMAIL estiver
  // configurado; caso contrário fica null e segue fluxo padrão pelas tabelas.
  const isOwnerByEmail = OWNER_EMAIL !== '' && u.email?.toLowerCase() === OWNER_EMAIL
  if (isOwnerByEmail) userRole.value = 'owner'

  let lastErr: unknown = null

  for (let attempt = 0; attempt < ROLE_TIMEOUTS_MS.length; attempt++) {
    try {
      const [roleRes, subRes] = await Promise.all([
        withTimeout(
          supabase.from('user_roles').select('role').eq('user_id', u.id).maybeSingle(),
          ROLE_TIMEOUTS_MS[attempt]
        ),
        withTimeout(
          supabase.from('subscribers').select('*').eq('user_id', u.id).maybeSingle(),
          ROLE_TIMEOUTS_MS[attempt]
        )
      ])

      const roleRow = roleRes.data as { role?: string } | null
      const sub = subRes.data as SubscriberRow | null

      if (roleRow?.role === 'owner' || roleRow?.role === 'admin') {
        userRole.value = roleRow.role as AppRole
      }
      subscriber.value = sub ?? null
      if (!userRole.value && sub) userRole.value = 'client'

      if (!userRole.value) {
        roleStatus.value = 'no-role'
        return { ok: false, reason: 'no-role' }
      }
      roleStatus.value = 'ready'
      return { ok: true }
    } catch (err) {
      // Abort = navegação SPA cancelou o fetch. Não retry; não é falha real.
      if (isAbort(err)) {
        roleStatus.value = isOwnerByEmail ? 'ready' : 'transient-error'
        return { ok: isOwnerByEmail, reason: 'transient-error' } as FetchRoleResult
      }
      lastErr = err
      // Continua pro próximo timeout (8s → 12s)
    }
  }

  console.error('[useAuth] fetchUserRole: erro transitório após retries:', lastErr)
  // Owner-by-email mantém acesso mesmo com falha de rede.
  roleStatus.value = isOwnerByEmail ? 'ready' : 'transient-error'
  return { ok: isOwnerByEmail, reason: 'transient-error' } as FetchRoleResult
}

// ======================================================
// Inactivity tracker - 30 min com aviso aos 28 min (2 min antes).
// Eventos custom: 'session-expiring' e 'session-expired' são consumidos
// pela UI (SessionNotice) pra mostrar toasts. Logout automático ao expirar.
// ======================================================
const INACTIVITY_MS = 30 * 60 * 1000
const WARNING_BEFORE_MS = 2 * 60 * 1000
const ACTIVITY_THROTTLE_MS = 2000
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const

let warningTimerId: number | null = null
let expiryTimerId: number | null = null
let lastActivityAt = 0
let activityBound = false

function clearInactivityTimers() {
  if (warningTimerId !== null) { window.clearTimeout(warningTimerId); warningTimerId = null }
  if (expiryTimerId !== null) { window.clearTimeout(expiryTimerId); expiryTimerId = null }
}

function scheduleInactivityTimers() {
  clearInactivityTimers()
  if (!session.value) return
  warningTimerId = window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('session-expiring', {
      detail: { remainingMs: WARNING_BEFORE_MS }
    }))
  }, INACTIVITY_MS - WARNING_BEFORE_MS)
  expiryTimerId = window.setTimeout(async () => {
    window.dispatchEvent(new CustomEvent('session-expired'))
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[useAuth] signOut on expiry failed:', err)
    }
  }, INACTIVITY_MS)
}

function onActivity() {
  const now = Date.now()
  if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return
  lastActivityAt = now
  // Só reagenda se houver sessão ativa - fora isso é no-op barato.
  if (session.value) scheduleInactivityTimers()
}

function bindActivityListeners() {
  if (activityBound || typeof window === 'undefined') return
  activityBound = true
  ACTIVITY_EVENTS.forEach(ev =>
    window.addEventListener(ev, onActivity, { passive: true })
  )
}

function unbindActivityListeners() {
  if (!activityBound || typeof window === 'undefined') return
  activityBound = false
  ACTIVITY_EVENTS.forEach(ev =>
    window.removeEventListener(ev, onActivity)
  )
}

// ======================================================
// API pública
// ======================================================
export function useAuth() {
  const isAuthenticated = computed(() => !!session.value)
  const isOwner = computed(() => userRole.value === 'owner')
  const isAdmin = computed(() => userRole.value === 'admin' || userRole.value === 'owner')
  const isClient = computed(() => userRole.value === 'client')

  async function signInWithEmail(email: string, password: string) {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })
      if (error) throw error

      session.value = data.session
      user.value = data.user
      const result = await fetchUserRole()
      // Login sem papel = conta sem RBAC configurada. Sinaliza pra UI tratar.
      if (!result.ok && result.reason === 'no-role') {
        window.dispatchEvent(new CustomEvent('auth-no-access', {
          detail: { reason: 'no-role' }
        }))
      }
      return { success: true as const }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false as const, error: humanizeAuthError(msg) }
    } finally {
      loading.value = false
    }
  }

  async function sendPasswordReset(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`
      })
      if (error) throw error
      return { success: true as const }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false as const, error: humanizeAuthError(msg) }
    }
  }

  // Verifica o código (OTP) de 6 dígitos enviado por email.
  // Em sucesso, o Supabase cria uma sessão temporária para o usuário
  // permitindo updateUser({ password }) na etapa seguinte.
  async function verifyPasswordResetToken(email: string, token: string) {
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'recovery'
      })
      if (error) throw error
      return { success: true as const }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      const m = msg.toLowerCase()
      if (m.includes('expired') || m.includes('invalid')) {
        return { success: false as const, error: 'Código inválido ou expirado. Solicite um novo.' }
      }
      return { success: false as const, error: humanizeAuthError(msg) }
    }
  }

  async function updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true as const }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return { success: false as const, error: humanizeAuthError(msg) }
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[useAuth] signOut error:', err)
    } finally {
      session.value = null
      user.value = null
      userRole.value = null
      subscriber.value = null
      roleStatus.value = 'idle'
      clearInactivityTimers()
    }
  }

  // Defesa em profundidade: se alguém usar useAuth() antes do bootAuth()
  // ter rodado (cenário raro como testes), dispara on-demand.
  if (!isInitialized.value) bootAuth()

  return {
    user: readonly(user),
    session: readonly(session),
    loading: readonly(loading),
    userRole: readonly(userRole),
    subscriber: readonly(subscriber),
    roleStatus: readonly(roleStatus),

    isAuthenticated,
    isOwner,
    isAdmin,
    isClient,

    signInWithEmail,
    sendPasswordReset,
    verifyPasswordResetToken,
    updatePassword,
    signOut,
    fetchUserRole
  }
}

// Singletons exportados pra uso fora de componentes (guards, plugins)
export { user, session, userRole, subscriber, loading, roleStatus }

// ======================================================
// Init global (chamado de main.js antes do mount).
// Garante que session.value/userRole.value estejam hidratados ANTES da
// primeira navegação do router - elimina race conditions onde componentes
// mount antes do auth resolver e veem isAuthenticated=false.
// ======================================================
let bootPromise: Promise<void> | null = null
let bootSubscription: { unsubscribe: () => void } | null = null

export function bootAuth(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    try {
      bindActivityListeners()

      // Listener global - sobrevive ao app inteiro
      const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT') {
          session.value = null
          user.value = null
          userRole.value = null
          subscriber.value = null
          roleStatus.value = 'idle'
          clearInactivityTimers()
          return
        }

        // TOKEN_REFRESHED sem sessão = refresh token inválido/expirado.
        // Tratamos como signed out implícito.
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          session.value = null
          user.value = null
          userRole.value = null
          subscriber.value = null
          roleStatus.value = 'idle'
          clearInactivityTimers()
          return
        }

        session.value = newSession
        user.value = newSession?.user ?? null
        if (newSession?.user) {
          // Defer pra evitar deadlock com o callback do auth client
          window.setTimeout(() => {
            void fetchUserRole().then((res) => {
              if (!res.ok && res.reason === 'no-role') {
                window.dispatchEvent(new CustomEvent('auth-no-access', {
                  detail: { reason: 'no-role' }
                }))
              }
            })
          }, 0)
          scheduleInactivityTimers()
        }
      })
      bootSubscription = data.subscription

      const { data: { session: existing }, error } = await supabase.auth.getSession()
      if (error) {
        // Erro real ao ler sessão - limpa estado mas NÃO chama signOut()
        // (que dispara network e pode falhar em loop). Listener cuidará
        // de limpar tokens corrompidos no próximo evento.
        console.error('[useAuth] getSession error:', error)
      } else if (existing) {
        session.value = existing
        user.value = existing.user
        await fetchUserRole()
        scheduleInactivityTimers()
      }
      isInitialized.value = true
    } catch (err) {
      console.error('[useAuth] bootAuth error:', err)
    } finally {
      loading.value = false
    }
  })()
  return bootPromise
}

export function teardownAuth() {
  if (bootSubscription) {
    bootSubscription.unsubscribe()
    bootSubscription = null
  }
  clearInactivityTimers()
  unbindActivityListeners()
}
