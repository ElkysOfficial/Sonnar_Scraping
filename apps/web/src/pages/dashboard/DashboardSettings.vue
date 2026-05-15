<template>
  <div class="dset">
    <!-- Conta -->
    <section class="dset-card">
      <header class="dset-card__head">
        <h2>Conta</h2>
        <p>Identidade e contato. Esses dados ficam fora dos canais públicos.</p>
      </header>

      <form class="dset-form" novalidate @submit.prevent="saveAccount">
        <div class="form-group">
          <label for="set-name" class="form-label">Nome</label>
          <input
            id="set-name"
            v-model.trim="accountForm.name"
            type="text"
            class="form-input"
            autocomplete="name"
            :disabled="loadingAccount"
          />
          <p class="form-hint">Usamos para personalizar suas mensagens.</p>
        </div>

        <div class="form-group">
          <label for="set-email" class="form-label">E-mail</label>
          <input
            id="set-email"
            :value="subscriber?.email"
            type="email"
            class="form-input"
            disabled
            readonly
          />
          <p class="form-hint">O e-mail é o seu login e não pode ser alterado por aqui. Fale com o suporte se precisar trocar.</p>
        </div>

        <div class="dset-actions">
          <button type="submit" class="btn btn-primary" :disabled="loadingAccount || !accountChanged">
            {{ loadingAccount ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>

        <p v-if="accountAlert.text" :class="['dset-alert', `dset-alert--${accountAlert.type}`]" role="alert">
          {{ accountAlert.text }}
        </p>
      </form>
    </section>

    <!-- Perfil de busca -->
    <section v-if="subscriber?.plan !== 'free'" class="dset-card">
      <header class="dset-card__head">
        <h2>Perfil de busca</h2>
        <p>O que usamos pra filtrar vagas para você.</p>
      </header>

      <form class="dset-form" novalidate @submit.prevent="saveProfile">
        <div class="form-group">
          <label class="form-label">WhatsApp</label>
          <CountryPhoneInput
            v-model="profileForm.whatsapp"
            :default-iso="'BR'"
            :disabled="loadingProfile"
            placeholder="99 99999-9999"
          />
          <p class="form-hint">Canal de entrega das vagas.</p>
        </div>

        <div class="form-group">
          <label for="set-stack" class="form-label">Stack</label>
          <div class="chip-input">
            <span v-for="tag in profileForm.stack" :key="tag" class="chip-tag">
              {{ tag }}
              <button type="button" class="chip-remove" :aria-label="`Remover ${tag}`" @click="removeStack(tag)">×</button>
            </span>
            <input
              id="set-stack"
              v-model="stackDraft"
              type="text"
              class="chip-input-field"
              :placeholder="profileForm.stack.length === 0 ? 'Ex: React, Node, Postgres…' : ''"
              :disabled="loadingProfile"
              @keydown.enter.prevent="addStackTag"
              @keydown.,.prevent="addStackTag"
              @keydown.backspace="onBackspaceStack"
              @blur="addStackTag"
            />
          </div>
          <p class="form-hint">Pressione <kbd>Enter</kbd> ou vírgula pra adicionar.</p>
        </div>

        <div class="form-group">
          <span class="form-label">Senioridade</span>
          <div class="radio-group">
            <label
              v-for="opt in seniorityOptions"
              :key="opt.value"
              class="chip-option"
              :class="{ 'chip-option--active': profileForm.seniority === opt.value }"
            >
              <input v-model="profileForm.seniority" type="radio" name="seniority" :value="opt.value" :disabled="loadingProfile" />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <span class="form-label">Modelo de trabalho</span>
          <div class="checkbox-group">
            <label
              v-for="opt in workModelOptions"
              :key="opt.value"
              class="chip-option"
              :class="{ 'chip-option--active': profileForm.workModels.includes(opt.value) }"
            >
              <input v-model="profileForm.workModels" type="checkbox" :value="opt.value" :disabled="loadingProfile" />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="needsLocation" class="form-group">
          <label for="set-location" class="form-label">Cidade / Estado</label>
          <input
            id="set-location"
            v-model.trim="profileForm.location"
            type="text"
            class="form-input"
            placeholder="Ex: São Paulo, SP"
            :disabled="loadingProfile"
          />
          <p class="form-hint">Como você marcou Híbrido ou Presencial, precisamos saber sua localização.</p>
        </div>

        <div class="form-group">
          <label for="set-salary" class="form-label">Salário mínimo aceito <span class="form-label-aside">(opcional)</span></label>
          <div class="input-prefix">
            <span class="input-prefix__symbol">R$</span>
            <input
              id="set-salary"
              v-model="profileForm.minSalaryDisplay"
              type="text"
              class="form-input"
              inputmode="numeric"
              placeholder="10.000"
              :disabled="loadingProfile"
              @input="onSalaryInput"
            />
          </div>
          <p class="form-hint">Filtra vagas abaixo desse valor mensal.</p>
        </div>

        <div class="dset-actions">
          <button type="submit" class="btn btn-primary" :disabled="loadingProfile || !profileChanged">
            {{ loadingProfile ? 'Salvando…' : 'Salvar perfil' }}
          </button>
        </div>

        <p v-if="profileAlert.text" :class="['dset-alert', `dset-alert--${profileAlert.type}`]" role="alert">
          {{ profileAlert.text }}
        </p>
      </form>
    </section>

    <!-- Plano free: convite pra fazer upgrade -->
    <section v-else class="dset-card dset-card--upgrade">
      <h2>Configurações do perfil de busca</h2>
      <p>Disponível nos planos Pro e Plus. No plano Comunidade não há filtro personalizado.</p>
      <router-link to="/dashboard/assinatura" class="btn btn-primary">Ver planos</router-link>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import CountryPhoneInput from '@/components/CountryPhoneInput.vue'
import type { Database } from '@/integrations/supabase/types'

type Profile = Database['public']['Tables']['subscriber_profiles']['Row']
type Seniority = 'junior' | 'pleno' | 'senior' | 'staff_lead'
type WorkModel = 'remote' | 'hybrid' | 'onsite'

const { subscriber, fetchUserRole } = useAuth()

// =========== Account ===========
const accountForm = reactive({ name: '' })
const accountInitial = ref('')
const loadingAccount = ref(false)
const accountAlert = reactive<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

const accountChanged = computed(() => accountForm.name !== accountInitial.value && accountForm.name.trim().length >= 2)

watch(subscriber, (s) => {
  if (s) {
    accountForm.name = s.name
    accountInitial.value = s.name
  }
}, { immediate: true })

async function saveAccount() {
  if (!subscriber.value || !accountChanged.value) return
  loadingAccount.value = true
  accountAlert.text = ''
  try {
    const { error } = await supabase
      .from('subscribers')
      .update({ name: accountForm.name })
      .eq('id', subscriber.value.id)
    if (error) throw error
    accountInitial.value = accountForm.name
    accountAlert.type = 'success'
    accountAlert.text = 'Dados atualizados.'
    await fetchUserRole()
  } catch {
    accountAlert.type = 'error'
    accountAlert.text = 'Não foi possível salvar agora. Tente novamente.'
  } finally {
    loadingAccount.value = false
  }
}

// =========== Profile ===========
const profile = ref<Profile | null>(null)
const stackDraft = ref('')
const profileForm = reactive({
  whatsapp: '',
  stack: [] as string[],
  seniority: 'pleno' as Seniority,
  workModels: [] as WorkModel[],
  location: '',
  minSalary: null as number | null,
  minSalaryDisplay: ''
})
const profileSnapshot = ref('')
const loadingProfile = ref(false)
const profileAlert = reactive<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

const seniorityOptions: { value: Seniority; label: string }[] = [
  { value: 'junior',     label: 'Júnior' },
  { value: 'pleno',      label: 'Pleno' },
  { value: 'senior',     label: 'Sênior' },
  { value: 'staff_lead', label: 'Staff / Lead' }
]

const workModelOptions: { value: WorkModel; label: string }[] = [
  { value: 'remote', label: 'Remoto' },
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'onsite', label: 'Presencial' }
]

const needsLocation = computed(() =>
  profileForm.workModels.includes('hybrid') || profileForm.workModels.includes('onsite')
)

const profileChanged = computed(() => snapshotOf(profileForm) !== profileSnapshot.value)

function snapshotOf(p: typeof profileForm) {
  return JSON.stringify({
    w: p.whatsapp,
    s: [...p.stack].sort(),
    sn: p.seniority,
    wm: [...p.workModels].sort(),
    loc: p.location,
    ms: p.minSalary
  })
}

function addStackTag() {
  const v = stackDraft.value.trim().replace(/,$/, '').trim()
  if (!v) { stackDraft.value = ''; return }
  const norm = v.toLowerCase()
  if (!profileForm.stack.find(t => t.toLowerCase() === norm) && profileForm.stack.length < 12) {
    profileForm.stack.push(v)
  }
  stackDraft.value = ''
}

function removeStack(tag: string) {
  profileForm.stack = profileForm.stack.filter(t => t !== tag)
}

function onBackspaceStack() {
  if (stackDraft.value === '' && profileForm.stack.length) {
    profileForm.stack.pop()
  }
}

function onSalaryInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  if (!digits) {
    profileForm.minSalary = null
    profileForm.minSalaryDisplay = ''
    return
  }
  const n = Number(digits)
  profileForm.minSalary = n
  profileForm.minSalaryDisplay = n.toLocaleString('pt-BR')
}

async function fetchProfile() {
  if (!subscriber.value?.id) return
  const { data } = await supabase
    .from('subscriber_profiles')
    .select('*')
    .eq('subscriber_id', subscriber.value.id)
    .maybeSingle()

  profile.value = data ?? null
  if (data) {
    profileForm.whatsapp = data.whatsapp || ''
    profileForm.stack = [...(data.stack || [])]
    profileForm.seniority = (data.seniority as Seniority) || 'pleno'
    profileForm.workModels = [...((data.work_models || []) as WorkModel[])]
    profileForm.location = data.location || ''
    profileForm.minSalary = data.min_salary ?? null
    profileForm.minSalaryDisplay = data.min_salary ? data.min_salary.toLocaleString('pt-BR') : ''
  }
  profileSnapshot.value = snapshotOf(profileForm)
}

async function saveProfile() {
  if (!subscriber.value || !profileChanged.value) return
  if (stackDraft.value.trim()) addStackTag()

  loadingProfile.value = true
  profileAlert.text = ''
  try {
    const payload = {
      whatsapp: profileForm.whatsapp,
      stack: profileForm.stack,
      seniority: profileForm.seniority,
      work_models: profileForm.workModels,
      min_salary: profileForm.minSalary,
      location: needsLocation.value ? profileForm.location : null
    }

    if (profile.value) {
      const { error } = await supabase
        .from('subscriber_profiles')
        .update(payload)
        .eq('id', profile.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('subscriber_profiles')
        .insert({ ...payload, subscriber_id: subscriber.value.id })
      if (error) throw error
    }

    profileAlert.type = 'success'
    profileAlert.text = 'Perfil atualizado.'
    await fetchProfile()
  } catch {
    profileAlert.type = 'error'
    profileAlert.text = 'Não foi possível salvar agora. Tente novamente.'
  } finally {
    loadingProfile.value = false
  }
}

onMounted(fetchProfile)
</script>

<style scoped>
.dset {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
  align-items: start;
}
@media (min-width: 1024px) {
  .dset { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
}

.dset-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  transition: box-shadow var(--transition-base);
}
.dset-card:hover { box-shadow: var(--shadow-md); }

.dset-card__head { margin-bottom: var(--space-4); }
.dset-card__head h2 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
}
.dset-card__head p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
}

.dset-form { display: flex; flex-direction: column; gap: var(--space-5); }

.form-input {
  background: var(--color-surface);
  border-radius: var(--radius-input);
  padding: var(--space-3) var(--space-4);
}
.form-input:disabled { opacity: 0.5; cursor: not-allowed; }
.form-input:focus:not(:disabled) { background: var(--color-surface-elevated); }

.form-label-aside { font-weight: var(--font-normal); color: var(--color-text-muted); font-size: 0.875em; }
.form-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
  line-height: var(--lh-body);
}
.form-hint kbd {
  display: inline-block;
  padding: 1px var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-family: ui-monospace, monospace;
  font-size: 0.75em;
}

/* Chip input (stack) */
.chip-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  min-height: var(--control-height-md);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.chip-input:focus-within {
  background: var(--color-surface-elevated);
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}
.chip-input-field {
  flex: 1;
  min-width: 120px;
  border: none;
  background: transparent;
  padding: var(--space-1) 0;
  color: var(--color-text-primary);
  font-size: var(--text-base);
  outline: none;
}
.chip-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-muted);
  border-radius: var(--radius-full);
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.chip-remove {
  background: transparent;
  border: none;
  color: var(--color-accent);
  font-size: var(--text-base);
  line-height: 1;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  cursor: pointer;
  border-radius: var(--radius-full);
}
.chip-remove:hover { background: var(--color-accent-muted); color: var(--color-text-inverse); }

/* Pílulas */
.radio-group, .checkbox-group { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chip-option:hover { border-color: var(--color-text-muted); color: var(--color-text-primary); }
.chip-option input { position: absolute; opacity: 0; pointer-events: none; }
.chip-option--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

/* Salary */
.input-prefix { position: relative; }
.input-prefix__symbol {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  font-weight: var(--font-medium);
  pointer-events: none;
}
.input-prefix .form-input { padding-left: 2.75rem; }

.dset-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; padding-top: var(--space-1); }

.dset-alert {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.dset-alert--success {
  background: var(--color-success-soft);
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
}
.dset-alert--error {
  background: var(--color-error-soft);
  color: var(--color-error);
  border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
}

/* Free upgrade card */
.dset-card--upgrade {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) var(--space-6);
}
.dset-card--upgrade h2 { font-size: var(--text-2xl); margin: 0; line-height: var(--lh-title); }
.dset-card--upgrade p { margin: 0; color: var(--color-text-secondary); max-width: 380px; line-height: var(--lh-body); }
</style>
