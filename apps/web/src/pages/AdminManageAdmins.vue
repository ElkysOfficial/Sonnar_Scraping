<template>
  <div class="admin-admins">
    <TopProgressBar :active="refreshing" />

    <AdminPageSkeleton
      v-if="initialLoading"
      variant="card-list"
      :show-action="true"
      :rows="5"
    />

    <template v-else>
    <div class="page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Gerenciar Administradores</h1>
        <p class="page-subtitle">
          Administradores visualizam assinantes e cadastram clientes. Não podem cancelar assinaturas nem promover outros admins.
        </p>
      </div>
      <button @click="openAddModal" class="btn btn-primary">
        Adicionar Admin
      </button>
    </div>

    <!-- Stats compactos -->
    <div class="admin-stats animate-fade-in-up stagger-1">
      <div class="stat-pill">
        <span class="stat-pill__label">Total</span>
        <span class="stat-pill__value">{{ admins.length }}</span>
      </div>
      <div class="stat-pill stat-pill--owner">
        <span class="stat-pill__label">Owners</span>
        <span class="stat-pill__value">{{ ownersCount }}</span>
      </div>
      <div class="stat-pill stat-pill--admin">
        <span class="stat-pill__label">Admins</span>
        <span class="stat-pill__value">{{ adminsCount }}</span>
      </div>
    </div>

    <!-- Admins List -->
    <div class="admins-list animate-fade-in-up stagger-2">
      <div
        v-for="(admin, index) in admins"
        :key="admin.id"
        class="admin-card"
        :class="{ 'admin-card--owner': admin.role === 'owner' }"
        :style="{ animationDelay: `${index * 50}ms` }"
      >
        <div class="admin-info">
          <div class="admin-avatar" :class="{ 'admin-avatar--owner': admin.role === 'owner' }">
            <span>{{ getInitials(admin.email) }}</span>
            <span v-if="admin.role === 'owner'" class="admin-avatar__crown" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M3 18l2-9 4 5 3-7 3 7 4-5 2 9H3zm0 2h18v2H3v-2z" />
              </svg>
            </span>
          </div>
          <div class="admin-details">
            <span class="admin-email">{{ admin.email }}</span>
            <span class="admin-role-badge" :class="`admin-role-badge--${admin.role}`">
              {{ admin.role === 'owner' ? 'Owner' : 'Administrador' }}
            </span>
          </div>
        </div>
        <div class="admin-actions">
          <span class="admin-date">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Desde {{ formatDate(admin.created_at) }}
          </span>
          <button
            v-if="admin.role !== 'owner'"
            @click="confirmRemove(admin)"
            class="btn btn-icon btn-ghost btn-remove"
            :disabled="removingId === admin.id"
            :aria-label="`Remover ${admin.email}`"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      <EmptyDetection
        v-if="admins.length === 0"
        icon="users"
        title="Nenhum admin detectado"
        subtitle="Adicione administradores para gerenciar o sistema"
      />
    </div>
    </template>

    <!-- Add Admin Modal -->
    <Transition name="motion-modal">
      <div
        v-if="showAddModal"
        ref="addModalRef"
        class="modal-overlay motion-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-admin-title"
        tabindex="-1"
        @click.self="closeAddModal"
        @keydown.esc="closeAddModal"
      >
        <div class="modal motion-modal">
        <div class="modal-header">
          <h3 id="add-admin-title" class="modal-title">Adicionar Administrador</h3>
          <button @click="closeAddModal" class="modal-close" data-autofocus aria-label="Fechar modal">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="addAdmin" class="modal-body">
          <div v-if="addSuccess" class="success-alert-sm">
            ✅ {{ addSuccess }}
          </div>

          <div v-if="addError" class="error-alert-sm">
            {{ addError }}
          </div>

          <div v-if="!addSuccess" class="form-group">
            <label for="adminEmail" class="form-label">E-mail do novo administrador</label>
            <input
              id="adminEmail"
              v-model="newAdminEmail"
              type="email"
              class="form-input"
              placeholder="admin@exemplo.com"
              required
              :disabled="isAdding"
            />
            <p class="form-hint">
              Um email será enviado com a senha temporária de acesso.
            </p>
          </div>
        </form>

        <div class="modal-footer">
          <button @click="closeAddModal" class="btn btn-secondary">
            {{ addSuccess ? 'Fechar' : 'Cancelar' }}
          </button>
          <button 
            v-if="!addSuccess"
            @click="addAdmin" 
            class="btn btn-primary" 
            :disabled="isAdding || !newAdminEmail"
          >
            <span v-if="isAdding" class="loading-spinner-sm"></span>
            <span v-else>Adicionar</span>
          </button>
        </div>
      </div>
      </div>
    </Transition>

    <!-- Remove Confirmation Modal -->
    <Transition name="motion-modal">
      <div
        v-if="showRemoveModal"
        ref="removeModalRef"
        class="modal-overlay motion-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-admin-title"
        tabindex="-1"
        @click.self="closeRemoveModal"
        @keydown.esc="closeRemoveModal"
      >
        <div class="modal motion-modal">
        <div class="modal-header">
          <h3 id="remove-admin-title" class="modal-title">Remover Administrador</h3>
          <button @click="closeRemoveModal" class="modal-close" data-autofocus aria-label="Fechar modal">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <p>
            Tem certeza que deseja remover o administrador <strong>{{ adminToRemove?.email }}</strong>?
          </p>
          <p class="modal-info">
            Esta pessoa perderá acesso ao painel administrativo imediatamente.
          </p>
        </div>

        <div class="modal-footer">
          <button @click="closeRemoveModal" class="btn btn-secondary">Cancelar</button>
          <button @click="executeRemove" class="btn btn-danger" :disabled="removingId !== null">
            <span v-if="removingId !== null" class="loading-spinner-sm"></span>
            <span v-else>Remover</span>
          </button>
        </div>
      </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import AdminPageSkeleton from '@/components/admin/AdminPageSkeleton.vue'
import TopProgressBar from '@/components/admin/TopProgressBar.vue'
import EmptyDetection from '@/components/EmptyDetection.vue'
import { useModalFocus } from '@/composables/useModalFocus'

interface Admin {
  id: string
  user_id: string
  email: string
  role: 'owner' | 'admin'
  created_at: string
}

const admins = ref<Admin[]>([])
const initialLoading = ref(true)
const refreshing = ref(false)

const ownersCount = computed(() => admins.value.filter(a => a.role === 'owner').length)
const adminsCount = computed(() => admins.value.filter(a => a.role === 'admin').length)

const showAddModal = ref(false)
const addModalRef = ref<HTMLElement | null>(null)
const newAdminEmail = ref('')
const isAdding = ref(false)
const addError = ref('')
const addSuccess = ref('')

const showRemoveModal = ref(false)
const removeModalRef = ref<HTMLElement | null>(null)
const adminToRemove = ref<Admin | null>(null)
const removingId = ref<string | null>(null)

useModalFocus(showAddModal, addModalRef)
useModalFocus(showRemoveModal, removeModalRef)

onMounted(async () => {
  try {
    await fetchAdmins({ silent: true })
  } finally {
    initialLoading.value = false
  }
})

async function fetchAdmins(opts: { silent?: boolean } = {}) {
  if (!opts.silent) refreshing.value = true

  try {
    // Use edge function to fetch admins with emails
    const { data, error } = await supabase.functions.invoke('list-admins')

    if (error) throw error

    if (data?.admins) {
      admins.value = data.admins
    } else {
      admins.value = []
    }
  } catch (err) {
    console.error('Error fetching admins:', err)
    admins.value = []
  } finally {
    refreshing.value = false
  }
}

function getInitials(email: string): string {
  const name = email.split('@')[0]
  return name.slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR })
}

function openAddModal() {
  showAddModal.value = true
  newAdminEmail.value = ''
  addError.value = ''
  addSuccess.value = ''
}

function closeAddModal() {
  showAddModal.value = false
  addSuccess.value = ''
}

async function addAdmin() {
  if (!newAdminEmail.value) return

  isAdding.value = true
  addError.value = ''
  addSuccess.value = ''

  try {
    // Call edge function to add admin
    const { data, error } = await supabase.functions.invoke('add-admin', {
      body: { email: newAdminEmail.value }
    })

    if (error) throw error

    // Show success message
    addSuccess.value = data?.message || 'Administrador adicionado com sucesso!'
    
    // Clear email and refresh list
    newAdminEmail.value = ''
    await fetchAdmins()
    
    // Close modal after 3 seconds
    setTimeout(() => {
      closeAddModal()
    }, 3000)
  } catch (err) {
    console.error('Error adding admin:', err)
    addError.value = err instanceof Error ? err.message : 'Erro ao adicionar administrador'
  } finally {
    isAdding.value = false
  }
}

function confirmRemove(admin: Admin) {
  adminToRemove.value = admin
  showRemoveModal.value = true
}

function closeRemoveModal() {
  showRemoveModal.value = false
  adminToRemove.value = null
}

async function executeRemove() {
  if (!adminToRemove.value) return

  removingId.value = adminToRemove.value.id

  try {
    // Delete the role from user_roles
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', adminToRemove.value.id)

    if (error) throw error

    // Update local state
    admins.value = admins.value.filter(a => a.id !== adminToRemove.value?.id)
    closeRemoveModal()
  } catch (err) {
    console.error('Error removing admin:', err)
    alert('Erro ao remover administrador')
  } finally {
    removingId.value = null
  }
}
</script>

<style scoped>
.admin-admins {
  /* Sem max-width: o AdminLayout já cobre o cap em 1600px. Aqui usamos
     o espaço disponível com um grid 2-col em telas largas. */
  width: 100%;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-4);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: var(--ls-tight);
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  max-width: 580px;
  line-height: 1.5;
}

/* o ícone interno do <svg> em buttons herda dimensão do .btn-icon do globals */

/* Stats compactos */
.admin-stats {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  transition: border-color var(--transition-fast);
}
.stat-pill:hover { border-color: color-mix(in srgb, var(--color-text-muted) 30%, var(--color-border)); }
.stat-pill__label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
}
.stat-pill__value {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}
.stat-pill--owner {
  background: color-mix(in srgb, var(--chart-3) 8%, var(--color-surface));
  border-color: color-mix(in srgb, var(--chart-3) 35%, transparent);
}
.stat-pill--owner .stat-pill__value { color: var(--chart-3); }
.stat-pill--admin {
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-accent) 35%, transparent);
}
.stat-pill--admin .stat-pill__value { color: var(--color-accent); }

/* Lista */
/* Lista - grid 2 colunas em telas largas, 1 em telas menores. Em vez de
   flex column 100% width, ocupamos melhor o espaço horizontal quando há
   admins suficientes. */
.admins-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}
@media (max-width: 1024px) {
  .admins-list { grid-template-columns: 1fr; }
}

.admin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  gap: var(--space-4);
  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1),
              box-shadow 220ms ease,
              border-color 220ms ease;
  animation: fadeInUp 0.4s ease forwards;
  opacity: 0;
  position: relative;
  overflow: hidden;
}
.admin-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-line, var(--color-accent)), transparent);
  opacity: 0;
  transition: opacity 220ms ease;
}
/* Hover sem movimento - só a borda fica mais definida. */
.admin-card:hover {
  border-color: color-mix(in srgb, var(--color-text-muted) 40%, var(--color-border));
}
.admin-card:hover::before { opacity: 0.6; }

.admin-card--owner {
  --accent-line: var(--chart-3);
  border-color: color-mix(in srgb, var(--chart-3) 30%, transparent);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--chart-3) 5%, var(--color-surface)) 0%,
    var(--color-surface) 60%);
}
.admin-card--owner:hover {
  border-color: color-mix(in srgb, var(--chart-3) 55%, transparent);
  box-shadow: 0 8px 24px -12px color-mix(in srgb, var(--chart-3) 35%, transparent);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.admin-avatar {
  position: relative;
  width: var(--control-height-md);
  height: var(--control-height-md);
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  color: var(--color-on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  flex-shrink: 0;
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--color-accent) 50%, transparent);
  letter-spacing: var(--ls-normal);
}
.admin-avatar--owner {
  background: linear-gradient(135deg, var(--chart-3) 0%, var(--color-accent) 100%);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--chart-3) 60%, transparent);
}
.admin-avatar__crown {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--chart-3);
  color: var(--color-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-surface);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--chart-3) 60%, transparent);
}

.admin-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.admin-email {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.admin-role-badge {
  display: inline-flex;
  align-items: center;
  width: max-content;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.admin-role-badge--admin {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.admin-role-badge--owner {
  background: color-mix(in srgb, var(--chart-3) 12%, transparent);
  color: var(--chart-3);
  border: 1px solid color-mix(in srgb, var(--chart-3) 40%, transparent);
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.admin-date svg { color: var(--color-text-muted); }

/* btn-remove herda do global .btn .btn-icon .btn-ghost - só ajustamos o
   tom ao passar o mouse, indicando ação destrutiva. */
.btn-remove svg { width: 18px; height: 18px; }
.btn-remove:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 30%, transparent);
}
.btn-remove:active { background: color-mix(in srgb, var(--color-error) 18%, transparent); }

.empty-state {
  text-align: center;
  padding: var(--space-8);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  animation: fadeIn 0.4s ease;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8);
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
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Modal */
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

.error-alert-sm {
  padding: var(--space-3);
  background: var(--color-error-soft);
  border: 1px solid color-mix(in srgb, var(--color-error) 35%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.success-alert-sm {
  padding: var(--space-3);
  background: var(--color-success-soft);
  border: 1px solid color-mix(in srgb, var(--color-success) 35%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-success);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.form-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-2);
}

.modal-info {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-3);
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

@media (max-width: 640px) {
  .admin-card {
    flex-direction: column;
    align-items: flex-start;
    padding: 14px 16px;
  }
  .admin-actions {
    width: 100%;
    justify-content: space-between;
  }
  .admin-email { max-width: 100%; }
  .page-header { flex-direction: column; }
  .page-header .btn { width: 100%; }
}
</style>
