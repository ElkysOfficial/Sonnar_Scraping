<template>
  <div class="admin-subscribers">
    <TopProgressBar :active="refreshing" />

    <!-- Skeleton no boot inicial; depois disso, dados ficam visíveis e
         a barra fina indica refresh. -->
    <AdminPageSkeleton
      v-if="initialLoading"
      variant="table"
      :show-action="true"
      :rows="8"
      :columns="6"
    />

    <template v-else>
    <!-- Page header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Assinantes</h1>
        <p class="page-subtitle">{{ counters.total }} pessoa(s) na base - admins não aparecem aqui.</p>
      </div>
      <router-link to="/admin/new-client" class="btn btn-primary">
        Novo Cliente
      </router-link>
    </div>

    <!-- Filtros (busca + status) - globais entre abas -->
    <div class="filters-row">
      <div class="form-search">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="form-search__icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          class="form-input has-shortcut"
          placeholder="Buscar por nome, email ou telefone…"
          aria-label="Buscar assinantes"
        />
        <kbd class="form-search__shortcut" aria-hidden="true">/</kbd>
      </div>

      <select v-model="statusFilter" class="form-select" aria-label="Filtrar por status">
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

    <!-- Conteúdo principal - sempre visível pós-boot, refresh via TopProgressBar -->
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
import AdminPageSkeleton from '@/components/admin/AdminPageSkeleton.vue'
import TopProgressBar from '@/components/admin/TopProgressBar.vue'
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
// `initialLoading` controla o skeleton de página inteira no boot.
// `refreshing` é usado em recargas sob demanda → mostra apenas a barra fina.
const initialLoading = ref(true)
const refreshing = ref(false)
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
  try {
    await Promise.all([fetchAdmins(), fetchSubscribers({ silent: true })])
  } finally {
    initialLoading.value = false
  }
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

async function fetchSubscribers(opts: { silent?: boolean } = {}) {
  // `silent` (boot) não toca em refreshing - quem cuida é o initialLoading.
  // Recargas posteriores ativam a barra fina no topo, mantendo dados visíveis.
  if (!opts.silent) refreshing.value = true
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
    refreshing.value = false
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
  /* Sem max-width - AdminLayout já cobre o cap em 1600px. */
  width: 100%;
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
/* O botão "Novo Cliente" usa o .btn .btn-primary global - sem overrides locais. */

/* Filters row */
.filters-row {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: var(--space-3);
  align-items: center;
}

/* Busca usa .form-search + .form-input dos globals; aqui só o "halo" colorido
   por trás do input - toque visual exclusivo desta página. */
.form-search::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-secondary), var(--color-accent), var(--chart-3));
  opacity: 0;
  filter: blur(8px);
  transition: opacity var(--transition-base);
  pointer-events: none;
  z-index: 0;
}
.form-search:focus-within::before { opacity: 0.55; }
.form-search > .form-input { position: relative; z-index: 1; }
.form-search > .form-search__shortcut { z-index: 2; }
.form-search > .form-search__icon { z-index: 2; }

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
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);   /* 12px 20px - mais respiro */
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
  box-shadow: var(--shadow-sm);
}
.tab-btn__dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}
.tab-btn--plus      .tab-btn__dot { background: var(--chart-3); }
.tab-btn--pro       .tab-btn__dot { background: var(--chart-1); }
.tab-btn--community .tab-btn__dot { background: var(--color-success); }
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
