<template>
  <div class="admin-new-client">
    <!-- Header compacto -->
    <header class="page-header">
      <div>
        <h1 class="page-title">Novo Cliente</h1>
        <p class="page-subtitle">Cadastre um cliente e gere o link de pagamento.</p>
      </div>
      <router-link to="/admin/subscribers" class="btn btn-secondary btn-back">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Voltar
      </router-link>
    </header>

    <!-- Alertas (success/error) - compactos -->
    <Transition name="slide-down">
      <div v-if="successMessage" class="alert alert-success">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <div class="alert-content">
          <p class="alert-title">{{ successMessage }}</p>
          <div v-if="paymentLink" class="payment-link-box">
            <input ref="linkInput" :value="paymentLink" readonly class="payment-link-input" />
            <button class="btn btn-secondary btn-sm" @click="copyLink">
              <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="btn-icon-sm">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="btn-icon-sm">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {{ copied ? 'Copiado!' : 'Copiar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-down">
      <div v-if="errorMessage" class="alert alert-error">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span>{{ errorMessage }}</span>
      </div>
    </Transition>

    <form class="client-form" @submit.prevent="handleSubmit">
      <!-- Layout 2-col: dados+plano à esquerda, preferências à direita -->
      <div class="form-grid">
        <!-- Coluna esquerda: Dados Pessoais + Plano -->
        <div class="col-left">
          <section class="card">
            <header class="card-head">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="card-icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <h2>Dados Pessoais</h2>
            </header>
            <div class="card-body fields-2col">
              <label class="field">
                <span class="field-label">Nome completo *</span>
                <input v-model="form.fullName" type="text" placeholder="Nome do cliente" required />
              </label>
              <label class="field">
                <span class="field-label">E-mail *</span>
                <input v-model="form.email" type="email" placeholder="email@exemplo.com" required />
              </label>
              <label class="field">
                <span class="field-label">WhatsApp *</span>
                <input v-model="form.phone" type="tel" placeholder="(11) 99999-9999" required />
              </label>
              <label class="field">
                <span class="field-label">CPF *</span>
                <input v-model="form.cpf" type="text" placeholder="000.000.000-00" required />
              </label>
            </div>
          </section>

          <section class="card">
            <header class="card-head">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="card-icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              <h2>Plano</h2>
            </header>
            <div class="card-body plan-row">
              <label class="plan-card" :class="{ selected: form.plan === 'pro' }">
                <input v-model="form.plan" type="radio" value="pro" class="sr-only" />
                <div class="plan-top">
                  <span class="plan-badge plan-badge--pro">PRO</span>
                  <span class="plan-price">R$ 5<span>/mês</span></span>
                </div>
                <p class="plan-desc">Vagas por WhatsApp</p>
                <span v-if="form.plan === 'pro'" class="plan-check" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
              </label>
              <label class="plan-card" :class="{ selected: form.plan === 'plus' }">
                <input v-model="form.plan" type="radio" value="plus" class="sr-only" />
                <div class="plan-top">
                  <span class="plan-badge plan-badge--plus">PLUS</span>
                  <span class="plan-price">R$ 10<span>/mês</span></span>
                </div>
                <p class="plan-desc">WhatsApp + filtros personalizados</p>
                <span v-if="form.plan === 'plus'" class="plan-check" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </span>
              </label>
            </div>
          </section>
        </div>

        <!-- Coluna direita: Preferências -->
        <section class="card col-right">
          <header class="card-head">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="card-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            <h2>Preferências <small>(opcional)</small></h2>
          </header>
          <div class="card-body prefs">
            <label class="field">
              <span class="field-label">Tecnologias</span>
              <input v-model="form.stacks" type="text" placeholder="Python, JavaScript, React…" />
              <span class="field-hint">Separadas por vírgula</span>
            </label>

            <fieldset class="chip-group">
              <legend class="field-label">Senioridade</legend>
              <div class="chips">
                <label v-for="opt in ['Júnior','Pleno','Sênior']" :key="opt" class="chip">
                  <input v-model="form.seniority" type="checkbox" :value="opt" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="chip-group">
              <legend class="field-label">Modelo de trabalho</legend>
              <div class="chips">
                <label v-for="opt in ['Remoto','Híbrido','Presencial']" :key="opt" class="chip">
                  <input v-model="form.workMode" type="checkbox" :value="opt" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="chip-group">
              <legend class="field-label">Tipo de contrato</legend>
              <div class="chips">
                <label v-for="opt in ['CLT','PJ','Freelancer']" :key="opt" class="chip">
                  <input v-model="form.contract" type="checkbox" :value="opt" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </fieldset>
          </div>
        </section>
      </div>

      <!-- Submit (sempre visível, full-width) -->
      <div class="submit-row">
        <button type="submit" class="btn btn-primary btn-submit" :disabled="isSubmitting">
          <span v-if="isSubmitting" class="loading-spinner-sm"></span>
          <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="btn-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          {{ isSubmitting ? 'Gerando…' : 'Gerar Link de Pagamento' }}
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
  contract: [] as string[],
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
    const stacksArray = form.stacks.split(',').map(s => s.trim()).filter(s => s.length > 0)

    const payload = {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone.replace(/\D/g, ''),
      plan: form.plan,
      stacks: stacksArray,
      seniority: form.seniority[0] ?? 'pleno',
      workMode: form.workMode.length > 0 ? form.workMode : ['remote'],
    }

    const { data, error } = await supabase.functions.invoke('admin-create-client', { body: payload })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error ?? 'Falha ao criar cliente')

    successMessage.value = data.message ?? 'Cliente criado com sucesso.'
    if (data.paymentLink) paymentLink.value = data.paymentLink
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
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    if (linkInput.value) {
      linkInput.value.select()
      document.execCommand('copy')
      copied.value = true
      setTimeout(() => { copied.value = false }, 2000)
    }
  }
}
</script>

<style scoped>
.admin-new-client {
  /* Sem max-width: AdminLayout cobre o cap de container. Form ocupa espaço total. */
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Header - compacto */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.page-title {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: var(--ls-tight);
}
.page-subtitle {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.btn-back svg { width: 1rem; height: 1rem; margin-right: 6px; }

/* Alertas - sutis, sem shake/animação exagerada */
.alert {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
}
.alert-success {
  background: var(--color-success-soft);
  border: 1px solid color-mix(in srgb, var(--color-success) 28%, transparent);
}
.alert-error {
  background: var(--color-error-soft);
  border: 1px solid color-mix(in srgb, var(--color-error) 28%, transparent);
  align-items: center;
  color: var(--color-error);
}
.alert-icon { width: 1.125rem; height: 1.125rem; flex-shrink: 0; margin-top: 2px; }
.alert-success .alert-icon { color: var(--color-success); }
.alert-content { flex: 1; }
.alert-title { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-success); margin-bottom: var(--space-2); }
.payment-link-box { display: flex; gap: var(--space-2); }
.payment-link-input {
  flex: 1; padding: 6px 10px; font-size: var(--text-sm);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-background); color: var(--color-text-primary);
  font-family: var(--font-mono, ui-monospace, monospace);
}
.btn-icon-sm { width: 0.875rem; height: 0.875rem; margin-right: 4px; }
.btn-sm { padding: 6px 10px; font-size: var(--text-sm); min-height: auto; }

/* Slide-down transition */
.slide-down-enter-active, .slide-down-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-6px); }

/* Form layout */
.client-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}
.col-left { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.col-right { min-width: 0; }

/* Card */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 12px var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.card-head h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  letter-spacing: var(--ls-tight);
}
.card-head h2 small {
  font-size: var(--text-xs);
  font-weight: var(--font-normal);
  color: var(--color-text-muted);
  margin-left: 6px;
}
.card-icon { width: 1rem; height: 1rem; color: var(--color-accent); }
.card-body { padding: var(--space-4); }

/* Field */
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}
.field-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px; }
.field input,
.field-input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.field input:focus,
.field-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

/* Grid 2-col dentro do card de dados pessoais */
.fields-2col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }

/* Plano - cards horizontais compactos */
.plan-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-3) var(--space-4); }
.plan-card {
  position: relative;
  display: block;
  padding: 12px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  background: var(--color-background);
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}
.plan-card:hover { border-color: var(--color-text-muted); }
.plan-card.selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}
.plan-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.plan-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  border-radius: var(--radius-full, 999px);
  font-size: 11px;
  font-weight: var(--font-bold);
  letter-spacing: 0.06em;
}
.plan-badge--pro  { background: color-mix(in srgb, var(--chart-1) 12%, transparent); color: var(--chart-1); }
.plan-badge--plus { background: color-mix(in srgb, var(--chart-3) 12%, transparent); color: var(--chart-3); }
.plan-price { font-size: var(--text-base); font-weight: var(--font-bold); color: var(--color-text-primary); }
.plan-price span { font-size: var(--text-xs); font-weight: var(--font-normal); color: var(--color-text-muted); }
.plan-desc { margin: 0; font-size: var(--text-xs); color: var(--color-text-secondary); }
.plan-check {
  position: absolute; top: 10px; right: 10px;
  width: 1.25rem; height: 1.25rem;
  background: var(--color-accent);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.plan-check svg { width: 0.75rem; height: 0.75rem; color: white; }

/* Preferências */
.prefs { display: flex; flex-direction: column; gap: var(--space-3); }
.chip-group { border: none; padding: 0; margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid var(--color-border);
  background: var(--color-background);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
  user-select: none;
}
.chip input { display: none; }
.chip:hover { border-color: var(--color-text-muted); }
.chip:has(input:checked) {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}

/* Submit */
.submit-row { display: flex; justify-content: flex-end; }
.btn-submit {
  min-width: 280px;
  height: 44px;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  justify-content: center;
}
.btn-submit:hover:not(:disabled) {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.btn-icon { width: 1rem; height: 1rem; margin-right: 6px; }
.loading-spinner-sm {
  width: 1rem; height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* Responsivo */
@media (max-width: 1024px) {
  .form-grid { grid-template-columns: 1fr; }
  .col-right { order: 3; }
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; }
  .page-header .btn { width: 100%; justify-content: center; }
  .fields-2col { grid-template-columns: 1fr; }
  .plan-row { grid-template-columns: 1fr; }
  .submit-row { justify-content: stretch; }
  .btn-submit { min-width: 0; width: 100%; }
}
@media (max-width: 380px) {
  .page-title { font-size: var(--text-lg); }
  .card-body { padding: var(--space-3); }
  .chip { padding: 5px 10px; }
}
</style>
