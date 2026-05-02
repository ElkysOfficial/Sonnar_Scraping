<template>
  <div class="admin-new-client">
    <!-- Page Header -->
    <div class="page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Novo Cliente</h1>
        <p class="page-subtitle">Cadastre um novo cliente e gere o link de pagamento</p>
      </div>
      <router-link to="/admin/subscribers" class="btn btn-secondary">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Voltar
      </router-link>
    </div>

    <!-- Success Alert -->
    <div v-if="successMessage" class="alert alert-success motion-alert">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>
      <div class="alert-content">
        <p class="alert-title">{{ successMessage }}</p>
        <div v-if="paymentLink" class="payment-link-box">
          <input 
            ref="linkInput"
            :value="paymentLink" 
            readonly 
            class="payment-link-input"
          />
          <button @click="copyLink" class="btn btn-secondary btn-sm">
            <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon-sm">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon-sm">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {{ copied ? 'Copiado!' : 'Copiar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="alert alert-error motion-alert motion-alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
      <span>{{ errorMessage }}</span>
    </div>

    <form @submit.prevent="handleSubmit">
      <!-- Personal Data Section -->
      <section class="section-card animate-fade-in-up stagger-1">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="section-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            Dados Pessoais
          </h2>
        </div>
        <div class="section-card-content">
          <div class="form-grid">
            <div class="form-group">
              <label for="fullName" class="form-label">Nome Completo *</label>
              <input
                id="fullName"
                v-model="form.fullName"
                type="text"
                class="form-input"
                placeholder="Nome do cliente"
                required
              />
            </div>

            <div class="form-group">
              <label for="email" class="form-label">E-mail *</label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                class="form-input"
                placeholder="email@exemplo.com"
                required
              />
            </div>

            <div class="form-group">
              <label for="phone" class="form-label">Telefone (WhatsApp) *</label>
              <input
                id="phone"
                v-model="form.phone"
                type="tel"
                class="form-input"
                placeholder="(11) 99999-9999"
                required
              />
            </div>

            <div class="form-group">
              <label for="cpf" class="form-label">CPF *</label>
              <input
                id="cpf"
                v-model="form.cpf"
                type="text"
                class="form-input"
                placeholder="000.000.000-00"
                required
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Plan Selection Section -->
      <section class="section-card animate-fade-in-up stagger-2">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="section-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
            Plano
          </h2>
        </div>
        <div class="section-card-content">
          <div class="plan-grid">
            <label class="plan-card" :class="{ selected: form.plan === 'pro' }">
              <input 
                type="radio" 
                v-model="form.plan" 
                value="pro"
                class="sr-only"
              />
              <div class="plan-header">
                <span class="badge badge-pro">PRO</span>
                <span class="plan-price">R$ 5<span class="plan-period">/mês</span></span>
              </div>
              <p class="plan-desc">Vagas por WhatsApp</p>
              <div class="plan-check" v-if="form.plan === 'pro'">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
            </label>

            <label class="plan-card" :class="{ selected: form.plan === 'plus' }">
              <input 
                type="radio" 
                v-model="form.plan" 
                value="plus"
                class="sr-only"
              />
              <div class="plan-header">
                <span class="badge badge-plus">PLUS</span>
                <span class="plan-price">R$ 10<span class="plan-period">/mês</span></span>
              </div>
              <p class="plan-desc">WhatsApp + Filtros personalizados</p>
              <div class="plan-check" v-if="form.plan === 'plus'">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
            </label>
          </div>
        </div>
      </section>

      <!-- Preferences Section -->
      <section class="section-card animate-fade-in-up stagger-3">
        <div class="section-card-header">
          <h2 class="section-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="section-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Preferências (Opcional)
          </h2>
        </div>
        <div class="section-card-content">
          <div class="form-group">
            <label for="stacks" class="form-label">Tecnologias</label>
            <input
              id="stacks"
              v-model="form.stacks"
              type="text"
              class="form-input"
              placeholder="Python, JavaScript, React... (separadas por vírgula)"
            />
          </div>

          <div class="preferences-grid">
            <div class="form-group">
              <label class="form-label">Senioridade</label>
              <div class="checkbox-list">
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.seniority" value="Júnior" />
                  <span class="checkbox-label">Júnior</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.seniority" value="Pleno" />
                  <span class="checkbox-label">Pleno</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.seniority" value="Sênior" />
                  <span class="checkbox-label">Sênior</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Modelo de Trabalho</label>
              <div class="checkbox-list">
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.workMode" value="Remoto" />
                  <span class="checkbox-label">Remoto</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.workMode" value="Híbrido" />
                  <span class="checkbox-label">Híbrido</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.workMode" value="Presencial" />
                  <span class="checkbox-label">Presencial</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Tipo de Contrato</label>
              <div class="checkbox-list">
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.contract" value="CLT" />
                  <span class="checkbox-label">CLT</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.contract" value="PJ" />
                  <span class="checkbox-label">PJ</span>
                </label>
                <label class="checkbox-item">
                  <input type="checkbox" v-model="form.contract" value="Freelancer" />
                  <span class="checkbox-label">Freelancer</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Submit -->
      <div class="form-actions animate-fade-in-up stagger-4">
        <button type="submit" class="btn btn-primary btn-lg" :disabled="isSubmitting">
          <span v-if="isSubmitting" class="loading-spinner-sm"></span>
          <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          {{ isSubmitting ? 'Gerando...' : 'Gerar Link de Pagamento' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { supabase } from '@/integrations/supabase/client'

const form = reactive({
  fullName: '',
  email: '',
  phone: '',
  cpf: '',
  plan: 'pro',
  stacks: '',
  seniority: [] as string[],
  workMode: [] as string[],
  contract: [] as string[]
})

const isSubmitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const paymentLink = ref('')
const copied = ref(false)
const linkInput = ref<HTMLInputElement | null>(null)

async function handleSubmit() {
  isSubmitting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  paymentLink.value = ''

  try {
    const stacksArray = form.stacks
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const payload = {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone.replace(/\D/g, ''),
      plan: form.plan,
      stacks: stacksArray,
      seniority: form.seniority[0] ?? 'pleno',
      workMode: form.workMode.length > 0 ? form.workMode : ['remote']
    }

    const { data, error } = await supabase.functions.invoke('admin-create-client', {
      body: payload
    })

    if (error) throw error
    if (!data?.success) throw new Error(data?.error ?? 'Falha ao criar cliente')

    successMessage.value = data.message ?? 'Cliente criado com sucesso.'
    resetForm()
  } catch (err) {
    console.error('Error creating client:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Erro ao cadastrar cliente'
  } finally {
    isSubmitting.value = false
  }
}

function resetForm() {
  form.fullName = ''
  form.email = ''
  form.phone = ''
  form.cpf = ''
  form.plan = 'pro'
  form.stacks = ''
  form.seniority = []
  form.workMode = []
  form.contract = []
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(paymentLink.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Fallback for older browsers
    if (linkInput.value) {
      linkInput.value.select()
      document.execCommand('copy')
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    }
  }
}
</script>

<style scoped>
.admin-new-client {
  max-width: 800px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  gap: var(--space-4);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.btn-icon {
  width: 1rem;
  height: 1rem;
  margin-right: var(--space-2);
}

.btn-icon-sm {
  width: 0.875rem;
  height: 0.875rem;
  margin-right: var(--space-1);
}

/* Alerts */
.alert {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-6);
}

.alert-success {
  background: var(--color-success-soft);
  border: 1px solid color-mix(in srgb, var(--color-success) 28%, transparent);
  animation: slideInDown 0.4s ease;
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.alert-error {
  background: var(--color-error-soft);
  border: 1px solid color-mix(in srgb, var(--color-error) 28%, transparent);
  align-items: center;
  color: var(--color-error);
  animation: shake 0.5s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.alert-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.alert-success .alert-icon {
  color: var(--color-success);
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-success);
  margin-bottom: var(--space-2);
}

.payment-link-box {
  display: flex;
  gap: var(--space-2);
}

.payment-link-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
}

.btn-sm {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  min-height: auto;
}

/* Section Cards */
.section-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  margin-bottom: var(--space-5);
  overflow: hidden;
  transition: all var(--transition-fast);
}

.section-card:hover {
  border-color: var(--color-accent-muted);
  box-shadow: var(--shadow-md);
}

.section-card-header {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.02);
}

.section-card-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}

.section-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-accent);
}

.section-card-content {
  padding: var(--space-5);
}

/* Form Grid */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.preferences-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
  margin-top: var(--space-4);
}

/* Plan Cards */
.plan-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.plan-card {
  position: relative;
  display: block;
  padding: var(--space-5);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--color-background);
}

.plan-card:hover {
  border-color: var(--color-text-muted);
}

.plan-card.selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  transform: scale(1.02);
  box-shadow: var(--shadow-md);
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.plan-price {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.plan-period {
  font-size: var(--text-sm);
  font-weight: var(--font-normal);
  color: var(--color-text-muted);
}

.plan-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.plan-check {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 1.5rem;
  height: 1.5rem;
  background: var(--color-accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plan-check svg {
  width: 0.875rem;
  height: 0.875rem;
  color: white;
}

/* Checkboxes */
.checkbox-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.checkbox-item input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent);
}

.checkbox-label {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

/* Form Actions */
.form-actions {
  margin-top: var(--space-6);
}

.btn-lg {
  width: 100%;
  padding: var(--space-4);
  font-size: var(--text-base);
  justify-content: center;
  transition: all var(--transition-fast);
}

.btn-lg:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--color-accent) 35%, transparent);
}

.btn-lg:active:not(:disabled) {
  transform: translateY(0);
}

.loading-spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: var(--space-2);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-header .btn {
    width: 100%;
    justify-content: center;
  }

  .form-grid,
  .plan-grid {
    grid-template-columns: 1fr;
  }

  .preferences-grid {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  .payment-link-box {
    flex-direction: column;
  }
}
</style>
