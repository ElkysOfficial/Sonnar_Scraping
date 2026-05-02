<template>
  <div class="admin-admins">
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Gerenciar Administradores</h1>
      <button @click="openAddModal" class="btn btn-primary">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Adicionar Admin
      </button>
    </div>

    <p class="page-description animate-fade-in-up stagger-1">
      Administradores podem visualizar assinantes e cadastrar novos clientes, mas não podem cancelar assinaturas nem adicionar outros administradores.
    </p>

    <!-- Admins List -->
    <div class="admins-list animate-fade-in-up stagger-2">
      <div v-for="(admin, index) in admins" :key="admin.id" class="admin-card" :style="{ animationDelay: `${index * 50}ms` }">
        <div class="admin-info">
          <div class="admin-avatar">{{ getInitials(admin.email) }}</div>
          <div class="admin-details">
            <span class="admin-email">{{ admin.email }}</span>
            <span class="admin-role">{{ admin.role === 'owner' ? 'Owner' : 'Administrador' }}</span>
          </div>
        </div>
        <div class="admin-actions">
          <span class="admin-date">Desde {{ formatDate(admin.created_at) }}</span>
          <button 
            v-if="admin.role !== 'owner'"
            @click="confirmRemove(admin)" 
            class="btn-remove"
            :disabled="removingId === admin.id"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      <EmptyDetection
        v-if="admins.length === 0 && !isLoading"
        icon="users"
        title="Nenhum admin detectado"
        subtitle="Adicione administradores para gerenciar o sistema"
      />

      <div v-if="isLoading" class="loading-state">
        <SonnarLoader size="md" text="Detectando admins..." />
      </div>
    </div>

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
import { ref, onMounted } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import SonnarLoader from '@/components/SonnarLoader.vue'
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
const isLoading = ref(true)

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
  await fetchAdmins()
})

async function fetchAdmins() {
  isLoading.value = true

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
    isLoading.value = false
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
  max-width: 800px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
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

.page-description {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-6);
}

.admins-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  gap: var(--space-4);
  transition: all var(--transition-fast);
  animation: fadeInUp 0.4s ease forwards;
  opacity: 0;
}

.admin-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-accent-muted);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.admin-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  flex-shrink: 0;
}

.admin-details {
  display: flex;
  flex-direction: column;
}

.admin-email {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
}

.admin-role {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-date {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.btn-remove {
  padding: var(--space-2);
  color: var(--color-text-muted);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-remove svg {
  width: 1.25rem;
  height: 1.25rem;
}

.btn-remove:hover {
  color: var(--color-error);
  background: var(--color-error-soft);
  transform: scale(1.1);
}

.btn-remove:active {
  transform: scale(0.95);
}

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
  }

  .admin-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
