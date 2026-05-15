<template>
  <!-- Desktop Table -->
  <div class="subscribers-table-wrapper">
    <div class="table-scroll">
      <table class="subscribers-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Contato</th>
            <th>Plano</th>
            <th>Acesso</th>
            <th>Expiração</th>
            <th>Origem</th>
            <th v-if="isOwner">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sub in subscribers" :key="sub.id">
            <!-- Usuário -->
            <td>
              <div class="user-cell">
                <div class="user-avatar">{{ getInitials(sub.user_name) }}</div>
                <div class="user-info">
                  <span class="user-name">{{ sub.user_name }}</span>
                  <span class="user-email">{{ sub.email || '-' }}</span>
                </div>
              </div>
            </td>
            
            <!-- Contato -->
            <td class="contact-cell">{{ getContact(sub) }}</td>
            
            <!-- Plano -->
            <td>
              <span :class="['badge', `badge-${sub.derivedPlan}`]">
                {{ getPlanLabel(sub.derivedPlan) }}
              </span>
            </td>
            
            <!-- Acesso (Status) -->
            <td>
              <span :class="['badge', `badge-${sub.status}`]">
                {{ getStatusLabel(sub.status) }}
              </span>
            </td>
            
            <!-- Expiração -->
            <td class="expiration-cell" :class="{ 'expired': isExpired(sub) }">
              {{ getExpiration(sub) }}
            </td>
            
            <!-- Origem -->
            <td>
              <span class="origin-label">{{ getOriginLabel(sub.origin) }}</span>
            </td>
            
            <!-- Ações -->
            <td v-if="isOwner" class="actions-cell">
              <template v-if="showPromote && sub.derivedPlan === 'free'">
                <button 
                  @click="$emit('promote', sub)" 
                  class="btn-action btn-action-promote"
                >
                  Promover
                </button>
              </template>
              <template v-else-if="sub.derivedPlan !== 'free' && sub.active">
                <button 
                  @click="$emit('cancel', sub)" 
                  class="btn-action btn-action-cancel"
                >
                  Cancelar
                </button>
              </template>
              <span v-else class="text-muted">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Mobile Cards -->
  <div class="subscribers-cards">
    <div v-for="sub in subscribers" :key="sub.id" class="subscriber-card">
      <div class="subscriber-card-header">
        <div class="user-avatar">{{ getInitials(sub.user_name) }}</div>
        <div class="user-info">
          <span class="user-name">{{ sub.user_name }}</span>
          <span class="user-email">{{ sub.email || '-' }}</span>
        </div>
      </div>
      
      <div class="subscriber-card-row">
        <span class="subscriber-card-label">Contato</span>
        <span class="subscriber-card-value">{{ getContact(sub) }}</span>
      </div>
      
      <div class="subscriber-card-row">
        <span class="subscriber-card-label">Plano</span>
        <span :class="['badge', `badge-${sub.derivedPlan}`]">
          {{ getPlanLabel(sub.derivedPlan) }}
        </span>
      </div>
      
      <div class="subscriber-card-row">
        <span class="subscriber-card-label">Acesso</span>
        <span :class="['badge', `badge-${sub.status}`]">
          {{ getStatusLabel(sub.status) }}
        </span>
      </div>
      
      <div class="subscriber-card-row">
        <span class="subscriber-card-label">Expiração</span>
        <span class="subscriber-card-value" :class="{ 'expired': isExpired(sub) }">
          {{ getExpiration(sub) }}
        </span>
      </div>
      
      <div class="subscriber-card-row">
        <span class="subscriber-card-label">Origem</span>
        <span class="subscriber-card-value">{{ getOriginLabel(sub.origin) }}</span>
      </div>
      
      <div v-if="isOwner" class="subscriber-card-actions">
        <template v-if="showPromote && sub.derivedPlan === 'free'">
          <button 
            @click="$emit('promote', sub)" 
            class="btn-action btn-action-promote"
          >
            Promover
          </button>
        </template>
        <template v-else-if="sub.derivedPlan !== 'free' && sub.active">
          <button 
            @click="$emit('cancel', sub)" 
            class="btn-action btn-action-cancel"
          >
            Cancelar
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Subscriber {
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
  derivedPlan: 'pro' | 'plus' | 'free'
  status: 'active' | 'inactive' | 'canceled'
  origin: 'stripe' | 'admin' | 'free'
}

defineProps<{
  subscribers: Subscriber[]
  isOwner: boolean
  showPromote?: boolean
}>()

defineEmits<{
  cancel: [subscriber: Subscriber]
  promote: [subscriber: Subscriber]
}>()

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatPhone(phone: string | null): string {
  if (!phone) return '-'
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

function getContact(sub: Subscriber): string {
  if (sub.phone) return formatPhone(sub.phone)
  if (sub.email) return sub.email
  return '-'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR })
}

function getExpiration(sub: Subscriber): string {
  if (sub.derivedPlan === 'free') {
    return 'Ilimitado'
  }
  
  if (!sub.added_at) {
    return '-'
  }
  
  // Calculate expiration as added_at + 30 days (monthly subscription)
  const addedDate = new Date(sub.added_at)
  const expirationDate = new Date(addedDate)
  expirationDate.setDate(expirationDate.getDate() + 30)
  
  return format(expirationDate, "dd/MM/yyyy", { locale: ptBR })
}

function isExpired(sub: Subscriber): boolean {
  if (sub.derivedPlan === 'free' || !sub.added_at) {
    return false
  }
  
  const addedDate = new Date(sub.added_at)
  const expirationDate = new Date(addedDate)
  expirationDate.setDate(expirationDate.getDate() + 30)
  
  return expirationDate < new Date()
}

function getPlanLabel(plan: string): string {
  const labels: Record<string, string> = {
    pro: 'PRO',
    plus: 'PLUS',
    free: 'FREE'
  }
  return labels[plan] || plan.toUpperCase()
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    canceled: 'Cancelado'
  }
  return labels[status] || status
}

function getOriginLabel(origin: string): string {
  const labels: Record<string, string> = {
    stripe: 'Stripe',
    admin: 'Admin',
    free: 'Cadastro Free'
  }
  return labels[origin] || origin
}
</script>

<style scoped>
.subscribers-table-wrapper {
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

.subscribers-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 50rem;
}

.subscribers-table th,
.subscribers-table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
}

.subscribers-table th {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  background: var(--color-surface);
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

.subscribers-table td {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-subtle);
  vertical-align: middle;
}

.subscribers-table tbody tr:hover {
  background: var(--color-surface);
}

/* User Cell */
.user-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.user-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-weight: var(--font-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11.25rem;
}

.user-email {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11.25rem;
}

.contact-cell {
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.expiration-cell {
  white-space: nowrap;
  color: var(--color-text-muted);
}

.expiration-cell.expired,
.subscriber-card-value.expired {
  color: var(--color-error);
  font-weight: var(--font-medium);
}

.actions-cell {
  white-space: nowrap;
}

.text-muted {
  color: var(--color-text-muted);
}

/* Mobile Cards - controlled by global CSS */
.subscribers-cards {
  /* Visibility controlled by global styles.css */
}
</style>
