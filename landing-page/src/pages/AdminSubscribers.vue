<template>
  <div class="admin-subscribers">
    <!-- Page header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Assinantes</h1>
        <p class="page-subtitle">{{ counters.total }} pessoa(s) na base — admins não aparecem aqui.</p>
      </div>
      <router-link to="/admin/new-client" class="btn btn-primary">
        Novo Cliente
      </router-link>
    </div>

    <!-- Filtros (busca + status) — globais entre abas -->
    <div class="filters-row">
      <div class="filter-search">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="search-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar por nome, email ou telefone…"
          aria-label="Buscar assinantes"
        />
      </div>

      <select v-model="statusFilter" class="filter-select" aria-label="Filtrar por status">
        <option value="">Todos os status</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
        <option value="canceled">Cancelados</option>
      </select>
    </div>

    <!-- Tab strip -->
    <nav class="tab-strip" role="tablist" aria-label="Categorias de assinantes">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        type="button"
        :aria-selected="activeTab === tab.id"
        class="tab-btn"
        :class="[`tab-btn--${tab.id}`, { 'tab-btn--active': activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <span class="tab-btn__dot" aria-hidden="true"></span>
        <span class="tab-btn__label">{{ tab.label }}</span>
        <span class="tab-btn__count">{{ tab.count }}</span>
      </button>
    </nav>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <SonnarLoader size="md" text="Detectando assinantes…" />
    </div>

    <!-- Content -->
    <template v-else>
      <section class="panel">
        <SubscribersTable
          :subscribers="paginated"
          :is-owner="isOwner"
          :show-promote="activeTab === 'community'"
          @cancel="confirmCancel"
          @promote="openPromoteModal"
        />

        <EmptyDetection
          v-if="filteredOnTab.length === 0"
          icon="users"
          :title="emptyState.title"
          :subtitle="emptyState.subtitle"
        />

        <div v-if="totalPages > 1" class="pagination">
          <button class="pagination-btn" :disabled="page === 1" @click="page--">Anterior</button>
          <span class="pagination-info">Página {{ page }} de {{ totalPages }}</span>
          <button class="pagination-btn" :disabled="page === totalPages" @click="page++">Próxima</button>
        </div>
      </section>
    </template>

    <!-- Cancel modal -->
    <Transition name="motion-modal">
      <div
        v-if="showCancelModal"
        ref="cancelModalRef"
        class="modal-overlay motion-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        tabindex="-1"
        @click.self="closeCancelModal"
        @keydown.esc="closeCancelModal"
      >
        <div class="modal motion-modal">
          <div class="modal-header">
            <h3 id="cancel-subscription-title" class="modal-title">Cancelar Assinatura</h3>
            <button class="modal-close" data-autofocus aria-label="Fechar modal" @click="closeCancelModal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-warning">
              Tem certeza que deseja cancelar a assinatura de <strong>{{ subscriberToCancel?.user_name }}</strong>?
            </p>
            <p class="modal-info">Esta ação irá:</p>
            <ul class="action-list">
              <li>Cancelar a assinatura no Stripe</li>
              <li>Desativar o acesso do cliente ao sistema</li>
              <li>Parar o envio de vagas para este cliente</li>
            </ul>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeCancelModal">Voltar</button>
            <button class="btn btn-danger" :disabled="cancelingId !== null" @click="executeCancel">
              <span v-if="cancelingId !== null" class="loading-spinner-sm"></span>
              <span v-else>Confirmar Cancelamento</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Promote modal -->
    <Transition name="motion-modal">
      <div
        v-if="showPromoteModal"
        ref="promoteModalRef"
        class="modal-overlay motion-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-user-title"
        tabindex="-1"
        @click.self="closePromoteModal"
        @keydown.esc="closePromoteModal"
      >
        <div class="modal motion-modal">
          <div class="modal-header">
            <h3 id="promote-user-title" class="modal-title">Promover Usuário</h3>
            <button class="modal-close" data-autofocus aria-label="Fechar modal" @click="closePromoteModal">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-info">
              Para promover <strong>{{ subscriberToPromote?.user_name }}</strong> para um plano pago,
              use a opção "Novo Cliente" e crie uma assinatura manualmente.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closePromoteModal">Fechar</button>
            <router-link to="/admin/new-client" class="btn btn-primary">Ir para Novo Cliente</router-link>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import SubscribersTable from '@/components/SubscribersTable.vue'
import SonnarLoader from '@/components/SonnarLoader.vue'
import EmptyDetection from '@/components/EmptyDetection.vue'
import { useModalFocus } from '@/composables/useModalFocus'

const route = useRoute()
const router = useRouter()
const { isOwner } = useAuth()

interface RawSubscriber {
  id: string
  lid: string
  user_name: string
  email: string | null
  phone: string | null
  plan: string | null
  active: boolean | null
  added_at: string | null
  stripe_subscription_id: string | null
  approved_by: string | null
}

interface Subscriber extends RawSubscriber {
  derivedPlan: 'pro' | 'plus' | 'free'
  status: 'active' | 'inactive' | 'canceled'
  origin: 'stripe' | 'admin' | 'free'
}

type TabId = 'plus' | 'pro' | 'community'
const VALID_TABS: TabId[] = ['plus', 'pro', 'community']

const subscribers = ref<Subscriber[]>([])
const adminUserIds = ref<Set<string>>(new Set())
const isLoading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('')

const activeTab = ref<TabId>(
  (VALID_TABS as string[]).includes(route.query.tab as string) ? (route.query.tab as TabId) : 'plus'
)
watch(activeTab, (next) => {
  if (route.query.tab !== next) router.replace({ query: { ...route.query, tab: next } })
})
watch(() => route.query.tab, (next) => {
  if (next && (VALID_TABS as string[]).includes(next as string) && next !== activeTab.value) {
    activeTab.value = next as TabId
  }
})

// Reset paginação quando troca aba ou filtros
const page = ref(1)
const pageSize = 20
watch([activeTab, searchQuery, statusFilter], () => { page.value = 1 })

const showCancelModal = ref(false)
const cancelModalRef = ref<HTMLElement | null>(null)
const subscriberToCancel = ref<Subscriber | null>(null)
const cancelingId = ref<string | null>(null)

const showPromoteModal = ref(false)
const promoteModalRef = ref<HTMLElement | null>(null)
const subscriberToPromote = ref<Subscriber | null>(null)

useModalFocus(showCancelModal, cancelModalRef)
useModalFocus(showPromoteModal, promoteModalRef)

function processSubscriber(raw: RawSubscriber): Subscriber {
  let derivedPlan: 'pro' | 'plus' | 'free' = 'free'
  if (raw.plan === 'pro' || raw.plan === 'plus') derivedPlan = raw.plan

  let status: 'active' | 'inactive' | 'canceled' = 'active'
  if (!raw.active && raw.stripe_subscription_id) status = 'canceled'
  else if (!raw.active) status = 'inactive'

  const origin: 'stripe' | 'admin' | 'free' = raw.stripe_subscription_id
    ? 'stripe'
    : (derivedPlan === 'free' ? 'free' : 'admin')

  return { ...raw, derivedPlan, status, origin }
}

// Visíveis = não-admins
const visibleSubscribers = computed(() =>
  subscribers.value.filter(s => !adminUserIds.value.has(s.lid))
)

// Comunidade = sem plano pago ativo (free, cancelados, inativos sem stripe)
function isCommunity(s: Subscriber): boolean {
  // Plus e Pro com status ativo NÃO entram na comunidade
  if (s.derivedPlan === 'plus' || s.derivedPlan === 'pro') {
    return s.status !== 'active'
  }
  return true
}

const counters = computed(() => {
  const list = visibleSubscribers.value
  return {
    total: list.length,
    plus: list.filter(s => s.derivedPlan === 'plus' && s.status === 'active').length,
    pro: list.filter(s => s.derivedPlan === 'pro' && s.status === 'active').length,
    community: list.filter(isCommunity).length,
  }
})

const tabs = computed(() => [
  { id: 'plus' as TabId, label: 'Plus', count: counters.value.plus },
  { id: 'pro' as TabId, label: 'Pro', count: counters.value.pro },
  { id: 'community' as TabId, label: 'Comunidade', count: counters.value.community },
])

function matchSearch(s: Subscriber): boolean {
  if (!searchQuery.value) return true
  const q = searchQuery.value.toLowerCase()
  return (
    s.user_name.toLowerCase().includes(q) ||
    !!s.email?.toLowerCase().includes(q) ||
    !!s.phone?.includes(searchQuery.value)
  )
}

function matchStatus(s: Subscriber): boolean {
  if (!statusFilter.value) return true
  return s.status === statusFilter.value
}

const filteredOnTab = computed(() => {
  return visibleSubscribers.value.filter(s => {
    if (!matchSearch(s) || !matchStatus(s)) return false
    if (activeTab.value === 'plus')      return s.derivedPlan === 'plus' && s.status === 'active'
    if (activeTab.value === 'pro')       return s.derivedPlan === 'pro'  && s.status === 'active'
    /* community */                       return isCommunity(s)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredOnTab.value.length / pageSize)))

const paginated = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredOnTab.value.slice(start, start + pageSize)
})

const emptyState = computed(() => {
  if (activeTab.value === 'plus')
    return { title: 'Sem assinantes Plus ativos', subtitle: 'Quando alguém assinar o Plus, aparece aqui.' }
  if (activeTab.value === 'pro')
    return { title: 'Sem assinantes Pro ativos', subtitle: 'Quando alguém assinar o Pro, aparece aqui.' }
  return { title: 'Nenhum usuário na comunidade', subtitle: 'Cadastros sem plano pago ativo apareceriam aqui.' }
})

onMounted(async () => {
  await Promise.all([fetchAdmins(), fetchSubscribers()])
})

async function fetchAdmins() {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'admin'])
    if (error) throw error
    adminUserIds.value = new Set((data ?? []).map(r => r.user_id))
  } catch (err) {
    console.error('Falha ao carregar admins:', err)
  }
}

async function fetchSubscribers() {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('id, user_id, name, email, plan, status, stripe_subscription_id, created_at, subscriber_profiles(whatsapp)')
      .order('created_at', { ascending: false })

    if (error) throw error

    subscribers.value = (data ?? []).map(row => {
      const profile = Array.isArray(row.subscriber_profiles) ? row.subscriber_profiles[0] : row.subscriber_profiles
      const raw: RawSubscriber = {
        id: row.id,
        lid: row.user_id,
        user_name: row.name,
        email: row.email,
        phone: profile?.whatsapp ?? null,
        plan: row.plan,
        active: row.status === 'active',
        added_at: row.created_at,
        stripe_subscription_id: row.stripe_subscription_id,
        approved_by: null,
      }
      return processSubscriber(raw)
    })
  } catch (err) {
    console.error('Erro ao carregar assinantes:', err)
  } finally {
    isLoading.value = false
  }
}

function confirmCancel(subscriber: Subscriber) {
  subscriberToCancel.value = subscriber
  showCancelModal.value = true
}
function closeCancelModal() {
  showCancelModal.value = false
  subscriberToCancel.value = null
}
function openPromoteModal(subscriber: Subscriber) {
  subscriberToPromote.value = subscriber
  showPromoteModal.value = true
}
function closePromoteModal() {
  showPromoteModal.value = false
  subscriberToPromote.value = null
}

async function executeCancel() {
  if (!subscriberToCancel.value) return
  cancelingId.value = subscriberToCancel.value.id
  try {
    const { error } = await supabase.functions.invoke('admin-cancel-subscription', {
      body: {
        subscriberId: subscriberToCancel.value.id,
        lid: subscriberToCancel.value.lid,
        stripeSubscriptionId: subscriberToCancel.value.stripe_subscription_id,
      },
    })
    if (error) throw error
    const idx = subscribers.value.findIndex(s => s.id === subscriberToCancel.value?.id)
    if (idx !== -1) {
      subscribers.value[idx].active = false
      subscribers.value[idx].status = 'canceled'
    }
    closeCancelModal()
  } catch (err) {
    console.error('Erro ao cancelar:', err)
    alert('Erro ao cancelar assinatura. Tente novamente.')
  } finally {
    cancelingId.value = null
  }
}
</script>

<style scoped>
.admin-subscribers {
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: var(--ls-tight);
}
.page-subtitle {
  margin: 4px 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.btn-icon { width: 1rem; height: 1rem; margin-right: var(--space-1); }

/* === Novo Cliente — mesmo design do "Atualizar agora" === */
.page-header .btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 36px;
  min-height: 36px;
  min-width: 140px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--color-accent);
  color: var(--color-text-inverse, #fff);
  font-size: 13px;
  font-weight: var(--font-normal);
  font-family: inherit;
  letter-spacing: normal;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: none;
  transform: none;
  transition: opacity var(--transition-fast);
}
.page-header .btn-primary:hover {
  opacity: 0.9;
  background: var(--color-accent);
  box-shadow: none;
  transform: none;
}
.page-header .btn-primary:active {
  background: var(--color-accent);
  transform: none;
}
.page-header .btn-primary:disabled { opacity: 0.6; cursor: progress; }
.page-header .btn-primary .btn-icon { width: 1rem; height: 1rem; margin: 0; }

/* Filters row */
.filters-row {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: var(--space-3);
  align-items: center;
}

/* === Search input — premium === */
.filter-search {
  position: relative;
  display: flex;
  align-items: center;
}
.filter-search::before {
  /* halo de foco animado */
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 12px;
  background: linear-gradient(135deg, #06b6d4, #2563eb, #8b5cf6);
  opacity: 0;
  filter: blur(8px);
  transition: opacity 220ms ease;
  pointer-events: none;
  z-index: 0;
}
.filter-search:focus-within::before { opacity: 0.55; }

.filter-search input {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 44px;
  padding: 0 44px 0 42px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
  transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
}
.filter-search input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}
.filter-search input:hover {
  border-color: color-mix(in srgb, var(--color-text-muted) 35%, var(--color-border));
}
.filter-search input:focus {
  outline: none;
  border-color: #06b6d4;
  background: color-mix(in srgb, #06b6d4 4%, var(--color-surface));
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.search-icon {
  position: absolute;
  left: 14px;
  z-index: 2;
  width: 18px;
  height: 18px;
  color: var(--color-text-muted);
  pointer-events: none;
  transition: color 180ms ease, transform 180ms ease;
}
.filter-search:focus-within .search-icon {
  color: #06b6d4;
  transform: scale(1.08);
}

/* shortcut badge "/" — visual leve no canto direito */
.filter-search::after {
  content: '/';
  position: absolute;
  right: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-text-muted) 8%, transparent);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, 'JetBrains Mono', Consolas, monospace;
  pointer-events: none;
  transition: opacity 180ms ease;
}
.filter-search:focus-within::after { opacity: 0; }

/* === Filter select — alinhado === */
.filter-select {
  height: 44px;
  padding: 0 36px 0 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 14px center;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.filter-select:hover {
  border-color: color-mix(in srgb, var(--color-text-muted) 35%, var(--color-border));
}
.filter-select:focus {
  outline: none;
  border-color: #06b6d4;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.18);
}

/* Tab strip */
.tab-strip {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--color-glass-bg, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
.tab-btn:hover { background: var(--color-surface); color: var(--color-text-primary); }
.tab-btn--active {
  background: var(--color-surface);
  color: var(--color-text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.tab-btn__dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}
.tab-btn--plus      .tab-btn__dot { background: #8b5cf6; }
.tab-btn--pro       .tab-btn__dot { background: #2563eb; }
.tab-btn--community .tab-btn__dot { background: #16a34a; }
.tab-btn__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-glass-bg, rgba(0, 0, 0, 0.05));
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  font-variant-numeric: tabular-nums;
}
.tab-btn--active .tab-btn__count {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

/* Panel */
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

/* Loading & pagination */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12);
  color: var(--color-text-muted);
}
.loading-spinner-sm {
  width: 0.875rem; height: 0.875rem;
  border: 2px solid color-mix(in srgb, var(--color-error) 35%, transparent);
  border-top-color: var(--color-error);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.pagination-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: var(--text-sm);
  font-family: inherit;
}
.pagination-btn:hover:not(:disabled) { background: var(--color-surface); border-color: var(--color-text-muted); }
.pagination-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pagination-info { font-size: var(--text-sm); color: var(--color-text-muted); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
  z-index: var(--z-modal);
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--color-background);
  border-radius: var(--radius-xl);
  width: 100%; max-width: 28rem;
  box-shadow: var(--shadow-xl);
  animation: modalSlideIn 0.3s ease;
}
@keyframes modalSlideIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}
.modal-title { font-size: var(--text-lg); font-weight: var(--font-semibold); color: var(--color-text-primary); }
.modal-close {
  padding: var(--space-1); color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
}
.modal-close svg { width: 1.25rem; height: 1.25rem; }
.modal-body { padding: var(--space-5); }
.modal-warning { font-size: var(--text-base); color: var(--color-text-primary); margin-bottom: var(--space-4); }
.modal-info { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); }
.action-list { margin-left: var(--space-4); list-style: disc; }
.action-list li { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-3);
  padding: var(--space-5);
  border-top: 1px solid var(--color-border);
}
.btn-danger { background: var(--color-error); color: white; }
.btn-danger:hover:not(:disabled) { filter: brightness(0.95); }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

/* Responsivo: 360 → 768 */
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; }
  .page-header .btn { width: 100%; justify-content: center; }
  .filters-row { grid-template-columns: 1fr; }
  .tab-btn { padding: 10px 12px; font-size: var(--text-xs); }
  .tab-btn__label { font-size: var(--text-xs); }
}
@media (max-width: 380px) {
  .tab-btn { padding: 8px 10px; gap: 6px; }
  .page-title { font-size: var(--text-xl); }
}
</style>
