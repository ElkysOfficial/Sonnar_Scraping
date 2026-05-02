<template>
  <div class="admin-subscribers">
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Assinantes</h1>
      <router-link to="/admin/new-client" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Novo Cliente
      </router-link>
    </div>

    <!-- Filters Grid -->
    <div class="filters-grid animate-fade-in-up stagger-1">
      <div class="filter-search">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="search-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Buscar por nome, email ou telefone..."
        />
      </div>

      <select v-model="planFilter" class="filter-select-styled">
        <option value="">Todos os planos</option>
        <option value="plus">Plus</option>
        <option value="pro">Pro</option>
        <option value="free">Comunidade (Free)</option>
      </select>

      <select v-model="statusFilter" class="filter-select-styled">
        <option value="">Todos os status</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
        <option value="canceled">Cancelados</option>
      </select>

      <div class="counters-bar">
        <span class="counter-chip total">{{ counters.total }} Total</span>
        <span class="counter-chip plus">{{ counters.plus }} Plus</span>
        <span class="counter-chip pro">{{ counters.pro }} Pro</span>
        <span class="counter-chip free">{{ counters.free }} Free</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <SonnarLoader size="md" text="Detectando assinantes..." />
    </div>

    <!-- Content Sections -->
    <template v-else>
      <!-- PLUS Section -->
      <section v-if="showPlusSection" class="section-card animate-fade-in-up stagger-2">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <span class="badge badge-plus">PLUS</span>
            Assinantes Plus
          </h2>
          <span class="section-card-count">{{ allPlusSubscribers.length }}</span>
        </div>
        
        <SubscribersTable 
          :subscribers="plusSubscribers" 
          :is-owner="isOwner"
          @cancel="confirmCancel"
        />
        
        <EmptyDetection
          v-if="allPlusSubscribers.length === 0"
          icon="users"
          title="Nenhum sinal detectado"
          subtitle="Nenhum assinante Plus encontrado na área"
        />

        <!-- Pagination -->
        <div v-if="plusTotalPages > 1" class="pagination">
          <button 
            @click="plusPage--" 
            :disabled="plusPage === 1"
            class="pagination-btn"
          >
            Anterior
          </button>
          <span class="pagination-info">
            Página {{ plusPage }} de {{ plusTotalPages }}
          </span>
          <button 
            @click="plusPage++" 
            :disabled="plusPage === plusTotalPages"
            class="pagination-btn"
          >
            Próxima
          </button>
        </div>
      </section>

      <!-- PRO Section -->
      <section v-if="showProSection" class="section-card animate-fade-in-up stagger-3">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <span class="badge badge-pro">PRO</span>
            Assinantes Pro
          </h2>
          <span class="section-card-count">{{ allProSubscribers.length }}</span>
        </div>
        
        <SubscribersTable 
          :subscribers="proSubscribers" 
          :is-owner="isOwner"
          @cancel="confirmCancel"
        />
        
        <EmptyDetection
          v-if="allProSubscribers.length === 0"
          icon="users"
          title="Nenhum sinal detectado"
          subtitle="Nenhum assinante Pro encontrado na área"
        />

        <!-- Pagination -->
        <div v-if="proTotalPages > 1" class="pagination">
          <button 
            @click="proPage--" 
            :disabled="proPage === 1"
            class="pagination-btn"
          >
            Anterior
          </button>
          <span class="pagination-info">
            Página {{ proPage }} de {{ proTotalPages }}
          </span>
          <button 
            @click="proPage++" 
            :disabled="proPage === proTotalPages"
            class="pagination-btn"
          >
            Próxima
          </button>
        </div>
      </section>

      <!-- FREE Section -->
      <section v-if="showFreeSection" class="section-card animate-fade-in-up stagger-4">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <span class="badge badge-free">FREE</span>
            Comunidade
          </h2>
          <span class="section-card-count">{{ allFreeSubscribers.length }}</span>
        </div>
        
        <SubscribersTable 
          :subscribers="freeSubscribers" 
          :is-owner="isOwner"
          show-promote
          @promote="openPromoteModal"
        />
        
        <EmptyDetection
          v-if="allFreeSubscribers.length === 0"
          icon="users"
          title="Nenhum sinal detectado"
          subtitle="Nenhum usuário da comunidade encontrado"
        />

        <!-- Pagination -->
        <div v-if="freeTotalPages > 1" class="pagination">
          <button 
            @click="freePage--" 
            :disabled="freePage === 1"
            class="pagination-btn"
          >
            Anterior
          </button>
          <span class="pagination-info">
            Página {{ freePage }} de {{ freeTotalPages }}
          </span>
          <button 
            @click="freePage++" 
            :disabled="freePage === freeTotalPages"
            class="pagination-btn"
          >
            Próxima
          </button>
        </div>
      </section>
    </template>

    <!-- Cancel Confirmation Modal -->
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
          <button @click="closeCancelModal" class="modal-close" data-autofocus aria-label="Fechar modal">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <p class="modal-warning">
            Tem certeza que deseja cancelar a assinatura de <strong>{{ subscriberToCancel?.user_name }}</strong>?
          </p>
          <p class="modal-info">
            Esta ação irá:
          </p>
          <ul class="action-list">
            <li>Cancelar a assinatura no Stripe</li>
            <li>Desativar o acesso do cliente ao sistema</li>
            <li>Parar o envio de vagas para este cliente</li>
          </ul>
        </div>

        <div class="modal-footer">
          <button @click="closeCancelModal" class="btn btn-secondary">Voltar</button>
          <button @click="executeCancel" class="btn btn-danger" :disabled="cancelingId !== null">
            <span v-if="cancelingId !== null" class="loading-spinner-sm"></span>
            <span v-else>Confirmar Cancelamento</span>
          </button>
        </div>
      </div>
      </div>
    </Transition>

    <!-- Promote Modal -->
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
          <button @click="closePromoteModal" class="modal-close" data-autofocus aria-label="Fechar modal">
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
          <button @click="closePromoteModal" class="btn btn-secondary">Fechar</button>
          <router-link to="/admin/new-client" class="btn btn-primary">
            Ir para Novo Cliente
          </router-link>
        </div>
      </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import SubscribersTable from '@/components/SubscribersTable.vue'
import SonnarLoader from '@/components/SonnarLoader.vue'
import EmptyDetection from '@/components/EmptyDetection.vue'
import { useModalFocus } from '@/composables/useModalFocus'

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

const subscribers = ref<Subscriber[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const planFilter = ref('')
const statusFilter = ref('')

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
  if (raw.plan === 'pro' || raw.plan === 'plus') {
    derivedPlan = raw.plan
  }

  let status: 'active' | 'inactive' | 'canceled' = 'active'
  if (!raw.active && raw.stripe_subscription_id) {
    status = 'canceled'
  } else if (!raw.active) {
    status = 'inactive'
  }

  const origin: 'stripe' | 'admin' | 'free' = raw.stripe_subscription_id
    ? 'stripe'
    : (derivedPlan === 'free' ? 'free' : 'admin')

  return { ...raw, derivedPlan, status, origin }
}

// Counters
const counters = computed(() => ({
  total: subscribers.value.length,
  plus: subscribers.value.filter(s => s.derivedPlan === 'plus').length,
  pro: subscribers.value.filter(s => s.derivedPlan === 'pro').length,
  free: subscribers.value.filter(s => s.derivedPlan === 'free').length
}))

// Filtered subscribers
const filteredSubscribers = computed(() => {
  return subscribers.value.filter(sub => {
    const matchesSearch = !searchQuery.value || 
      sub.user_name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      sub.email?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      sub.phone?.includes(searchQuery.value)

    const matchesPlan = !planFilter.value || 
      sub.derivedPlan === planFilter.value

    const matchesStatus = !statusFilter.value ||
      sub.status === statusFilter.value

    return matchesSearch && matchesPlan && matchesStatus
  })
})

// Pagination state per section
const pageSize = ref(20)
const plusPage = ref(1)
const proPage = ref(1)
const freePage = ref(1)

// Section-specific subscribers (all)
const allPlusSubscribers = computed(() => 
  filteredSubscribers.value.filter(s => s.derivedPlan === 'plus')
)

const allProSubscribers = computed(() => 
  filteredSubscribers.value.filter(s => s.derivedPlan === 'pro')
)

const allFreeSubscribers = computed(() => 
  filteredSubscribers.value.filter(s => s.derivedPlan === 'free')
)

// Paginated subscribers for each section
const plusSubscribers = computed(() => {
  const start = (plusPage.value - 1) * pageSize.value
  return allPlusSubscribers.value.slice(start, start + pageSize.value)
})

const proSubscribers = computed(() => {
  const start = (proPage.value - 1) * pageSize.value
  return allProSubscribers.value.slice(start, start + pageSize.value)
})

const freeSubscribers = computed(() => {
  const start = (freePage.value - 1) * pageSize.value
  return allFreeSubscribers.value.slice(start, start + pageSize.value)
})

// Total pages per section
const plusTotalPages = computed(() => Math.ceil(allPlusSubscribers.value.length / pageSize.value))
const proTotalPages = computed(() => Math.ceil(allProSubscribers.value.length / pageSize.value))
const freeTotalPages = computed(() => Math.ceil(allFreeSubscribers.value.length / pageSize.value))

// Section visibility
const showPlusSection = computed(() => 
  !planFilter.value || planFilter.value === 'plus'
)

const showProSection = computed(() => 
  !planFilter.value || planFilter.value === 'pro'
)

const showFreeSection = computed(() => 
  !planFilter.value || planFilter.value === 'free'
)

onMounted(async () => {
  await fetchSubscribers()
})

async function fetchSubscribers() {
  isLoading.value = true

  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('id, user_id, name, email, plan, status, stripe_subscription_id, created_at, subscriber_profiles(whatsapp)')
      .order('created_at', { ascending: false })

    if (error) throw error

    subscribers.value = (data ?? []).map(row => {
      const profile = Array.isArray(row.subscriber_profiles)
        ? row.subscriber_profiles[0]
        : row.subscriber_profiles
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
        approved_by: null
      }
      return processSubscriber(raw)
    })
  } catch (err) {
    console.error('Error fetching subscribers:', err)
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
        stripeSubscriptionId: subscriberToCancel.value.stripe_subscription_id
      }
    })

    if (error) throw error

    // Update local state
    const index = subscribers.value.findIndex(s => s.id === subscriberToCancel.value?.id)
    if (index !== -1) {
      subscribers.value[index].active = false
      subscribers.value[index].status = 'canceled'
    }

    closeCancelModal()
  } catch (err) {
    console.error('Error canceling subscription:', err)
    alert('Erro ao cancelar assinatura. Tente novamente.')
  } finally {
    cancelingId.value = null
  }
}
</script>

<style scoped>
.admin-subscribers {
  max-width: 1400px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
  gap: var(--space-4);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.btn-icon {
  width: 1rem;
  height: 1rem;
  margin-right: var(--space-1);
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-8);
  font-size: var(--text-sm);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12);
  color: var(--color-text-muted);
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner-sm {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid color-mix(in srgb, var(--color-error) 35%, transparent);
  border-top-color: var(--color-error);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: var(--z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--color-background);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 28rem;
  box-shadow: var(--shadow-xl);
  animation: modalSlideIn 0.3s ease;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}

.modal-close {
  padding: var(--space-1);
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.modal-close svg {
  width: 1.25rem;
  height: 1.25rem;
}

.modal-body {
  padding: var(--space-5);
}

.modal-warning {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin-bottom: var(--space-4);
}

.modal-info {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.action-list {
  margin-left: var(--space-4);
  list-style: disc;
}

.action-list li {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--color-error-hover, var(--color-error-hover));
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Pagination */
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
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--text-sm);
}

.pagination-btn:hover:not(:disabled) {
  background: var(--color-background);
  border-color: var(--color-text-muted);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .page-header .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
