<template>
  <div class="dset">
    <!-- ====================== CONTA ====================== -->
    <section class="dset-card">
      <header class="dset-card__head">
        <div class="dset-card__heading">
          <span class="dset-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </span>
          <div>
            <h2>Conta</h2>
            <p>Identidade e login. Esses dados ficam fora dos canais públicos.</p>
          </div>
        </div>
      </header>

      <form class="dset-form" novalidate @submit.prevent="saveAccount">
        <div class="dset-grid">
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
            <input id="set-email" :value="subscriber?.email" type="email" class="form-input" disabled readonly />
            <p class="form-hint">É o seu login — fale com o suporte para alterar.</p>
          </div>
        </div>

        <div class="dset-actions">
          <button type="submit" class="btn btn-primary" :disabled="loadingAccount || !accountChanged">
            {{ loadingAccount ? 'Salvando…' : 'Salvar alterações' }}
          </button>
          <span v-if="accountAlert.text" :class="['dset-inline-alert', `dset-inline-alert--${accountAlert.type}`]" role="alert">
            {{ accountAlert.text }}
          </span>
        </div>
      </form>
    </section>

    <!-- ====================== PERFIL DE BUSCA ====================== -->
    <section v-if="subscriber?.plan !== 'free'" class="dset-card">
      <header class="dset-card__head">
        <div class="dset-card__heading">
          <span class="dset-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" opacity="0.55" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div>
            <h2>Perfil de busca</h2>
            <p>O que usamos para filtrar as vagas enviadas a você.</p>
          </div>
        </div>
        <span class="dset-quota" :class="{ 'dset-quota--out': quotaReached }">
          <strong>{{ editsUsed }}/{{ EDIT_LIMIT }}</strong> alterações este mês
        </span>
      </header>

      <!-- Aviso de limite atingido -->
      <div v-if="quotaReached" class="dset-alert dset-alert--warning" role="status">
        Você usou as {{ EDIT_LIMIT }} alterações deste mês. O perfil volta a ser editável em
        {{ nextResetLabel }}.
      </div>

      <!-- Indicador de etapas -->
      <ol class="dset-steps" aria-label="Etapas do perfil de busca">
        <li
          v-for="s in steps"
          :key="s.n"
          class="dset-step"
          :class="{
            'dset-step--active': step === s.n,
            'dset-step--done': step > s.n
          }"
        >
          <button type="button" class="dset-step__btn" @click="goToStep(s.n)">
            <span class="dset-step__mark">
              <svg v-if="step > s.n" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <template v-else>{{ s.n }}</template>
            </span>
            <span class="dset-step__label">{{ s.label }}</span>
          </button>
        </li>
      </ol>

      <form class="dset-form" novalidate @submit.prevent="saveProfile">
        <!-- ETAPA 1 — Tecnologias -->
        <div v-show="step === 1" class="dset-pane">
          <div class="form-group">
            <label for="set-stack" class="form-label">Tecnologias / Stack</label>
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
                :disabled="loadingProfile || quotaReached"
                @keydown.enter.prevent="addStackTag"
                @keydown.,.prevent="addStackTag"
                @keydown.backspace="onBackspaceStack"
                @blur="addStackTag"
              />
            </div>
            <p class="form-hint">
              Pressione <kbd>Enter</kbd> ou vírgula para adicionar. Até 12 tecnologias —
              quanto mais específico, melhor o match.
            </p>
            <p v-if="stepError && step === 1" class="dset-field-error">Adicione pelo menos uma tecnologia.</p>
          </div>
        </div>

        <!-- ETAPA 2 — Preferências -->
        <div v-show="step === 2" class="dset-pane">
          <div class="form-group">
            <span class="form-label">Área de atuação</span>
            <div class="chip-row">
              <label
                v-for="opt in areaOptions"
                :key="opt.value"
                class="chip-option"
                :class="{ 'chip-option--active': profileForm.areas.includes(opt.value) }"
              >
                <input v-model="profileForm.areas" type="checkbox" :value="opt.value" :disabled="loadingProfile || quotaReached" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <p class="form-hint">As vagas são filtradas pela sua área. Selecione uma ou mais.</p>
            <p v-if="stepError && step === 2 && profileForm.areas.length === 0" class="dset-field-error">
              Escolha pelo menos uma área.
            </p>
          </div>

          <div class="form-group">
            <span class="form-label">Senioridade</span>
            <div class="chip-row">
              <label
                v-for="opt in seniorityOptions"
                :key="opt.value"
                class="chip-option"
                :class="{ 'chip-option--active': profileForm.seniority === opt.value }"
              >
                <input v-model="profileForm.seniority" type="radio" name="seniority" :value="opt.value" :disabled="loadingProfile || quotaReached" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <p class="form-hint">Vagas de nível acima do seu são descartadas automaticamente.</p>
          </div>

          <div class="form-group">
            <span class="form-label">Modelo de trabalho</span>
            <div class="chip-row">
              <label
                v-for="opt in workModelOptions"
                :key="opt.value"
                class="chip-option"
                :class="{ 'chip-option--active': profileForm.workModels.includes(opt.value) }"
              >
                <input v-model="profileForm.workModels" type="checkbox" :value="opt.value" :disabled="loadingProfile || quotaReached" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <p v-if="stepError && step === 2 && profileForm.workModels.length === 0" class="dset-field-error">
              Escolha pelo menos um modelo de trabalho.
            </p>
          </div>

          <div v-if="needsLocation" class="form-group">
            <label for="set-location" class="form-label">Cidade / Estado</label>
            <input
              id="set-location"
              v-model.trim="profileForm.location"
              type="text"
              class="form-input"
              placeholder="Ex: São Paulo, SP"
              :disabled="loadingProfile || quotaReached"
            />
            <p class="form-hint">Necessário porque você marcou Híbrido ou Presencial.</p>
            <p v-if="stepError && step === 2 && !profileForm.location" class="dset-field-error">
              Informe sua cidade/estado.
            </p>
          </div>
        </div>

        <!-- ETAPA 3 — Entrega e revisão -->
        <div v-show="step === 3" class="dset-pane">
          <div class="form-group">
            <label class="form-label">WhatsApp de entrega</label>
            <CountryPhoneInput
              v-model="profileForm.whatsapp"
              :default-iso="'BR'"
              :disabled="loadingProfile || quotaReached"
              placeholder="99 99999-9999"
            />
            <p class="form-hint">Canal onde você recebe as vagas.</p>
            <p v-if="stepError && step === 3 && !whatsappValid" class="dset-field-error">
              Informe um número de WhatsApp válido.
            </p>
          </div>

          <div class="dset-review">
            <p class="dset-review__title">Revisão do perfil</p>
            <dl class="dset-review__list">
              <div>
                <dt>Áreas</dt>
                <dd>{{ areasLabel }}</dd>
              </div>
              <div>
                <dt>Tecnologias</dt>
                <dd>{{ profileForm.stack.length ? profileForm.stack.join(', ') : '—' }}</dd>
              </div>
              <div>
                <dt>Senioridade</dt>
                <dd>{{ seniorityLabel }}</dd>
              </div>
              <div>
                <dt>Modelo de trabalho</dt>
                <dd>{{ workModelsLabel }}</dd>
              </div>
              <div v-if="needsLocation">
                <dt>Localização</dt>
                <dd>{{ profileForm.location || '—' }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- Navegação -->
        <div class="dset-wizard-nav">
          <button
            v-if="step > 1"
            type="button"
            class="btn btn-secondary"
            :disabled="loadingProfile"
            @click="prevStep"
          >
            Voltar
          </button>
          <span class="dset-wizard-nav__spacer"></span>
          <button
            v-if="step < steps.length"
            type="button"
            class="btn btn-primary"
            @click="nextStep"
          >
            Continuar
          </button>
          <button
            v-else
            type="submit"
            class="btn btn-primary"
            :disabled="loadingProfile || quotaReached || !profileChanged"
          >
            {{ loadingProfile ? 'Salvando…' : 'Salvar perfil' }}
          </button>
        </div>

        <p v-if="profileAlert.text" :class="['dset-alert', `dset-alert--${profileAlert.type}`]" role="alert">
          {{ profileAlert.text }}
        </p>
      </form>
    </section>

    <!-- Plano free -->
    <section v-else class="dset-card dset-card--upgrade">
      <span class="dset-card__icon dset-card__icon--lg" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" opacity="0.6" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <h2>Perfil de busca personalizado</h2>
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

type Profile = Database['public']['Tables']['subscriber_profiles']['Row'] & {
  edits_count?: number | null
  edits_month?: string | null
  areas?: string[] | null
}
type Seniority = 'junior' | 'pleno' | 'senior' | 'staff_lead'
type WorkModel = 'remote' | 'hybrid' | 'onsite'

const { subscriber, fetchUserRole } = useAuth()

const EDIT_LIMIT = 3

// =========== Conta ===========
const accountForm = reactive({ name: '' })
const accountInitial = ref('')
const loadingAccount = ref(false)
const accountAlert = reactive<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

const accountChanged = computed(() =>
  accountForm.name !== accountInitial.value && accountForm.name.trim().length >= 2
)

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
    accountAlert.text = 'Não foi possível salvar agora.'
  } finally {
    loadingAccount.value = false
  }
}

// =========== Perfil de busca ===========
const steps = [
  { n: 1, label: 'Tecnologias' },
  { n: 2, label: 'Preferências' },
  { n: 3, label: 'Entrega' }
]
const step = ref(1)
const stepError = ref(false)

const profile = ref<Profile | null>(null)
const stackDraft = ref('')
const profileForm = reactive({
  whatsapp: '',
  areas: [] as string[],
  stack: [] as string[],
  seniority: 'pleno' as Seniority,
  workModels: [] as WorkModel[],
  location: ''
})
const profileSnapshot = ref('')
const loadingProfile = ref(false)
const profileAlert = reactive<{ text: string; type: 'error' | 'success' | 'warning' | '' }>({ text: '', type: '' })

// Quota mensal
const editsUsed = ref(0)
const quotaReached = computed(() => editsUsed.value >= EDIT_LIMIT)
const nextResetLabel = computed(() => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1, 1)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
})

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
// Areas de atuacao — valores canonicos casam com o gate de area do bot.
const areaOptions: { value: string; label: string }[] = [
  { value: 'backend',   label: 'Backend' },
  { value: 'frontend',  label: 'Frontend' },
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'mobile',    label: 'Mobile' },
  { value: 'design',    label: 'UX / UI / Design' },
  { value: 'dados',     label: 'Dados / BI / IA' },
  { value: 'devops',    label: 'DevOps / SRE / Cloud' },
  { value: 'infra',     label: 'Infraestrutura / Redes' },
  { value: 'qa',        label: 'QA / Testes' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'automacao', label: 'Automação / RPA' },
  { value: 'produto',   label: 'Produto / Agilidade' },
  { value: 'suporte',   label: 'Suporte / Helpdesk' }
]

const needsLocation = computed(() =>
  profileForm.workModels.includes('hybrid') || profileForm.workModels.includes('onsite')
)
const whatsappValid = computed(() => profileForm.whatsapp.replace(/\D/g, '').length >= 10)
const seniorityLabel = computed(() =>
  seniorityOptions.find(o => o.value === profileForm.seniority)?.label || '—'
)
const workModelsLabel = computed(() => {
  const labels = profileForm.workModels
    .map(v => workModelOptions.find(o => o.value === v)?.label)
    .filter(Boolean)
  return labels.length ? labels.join(', ') : '—'
})
const areasLabel = computed(() => {
  const labels = profileForm.areas
    .map(v => areaOptions.find(o => o.value === v)?.label)
    .filter(Boolean)
  return labels.length ? labels.join(', ') : '—'
})

const profileChanged = computed(() => snapshotOf() !== profileSnapshot.value)

function snapshotOf() {
  return JSON.stringify({
    w: profileForm.whatsapp,
    ar: [...profileForm.areas].sort(),
    s: [...profileForm.stack].sort(),
    sn: profileForm.seniority,
    wm: [...profileForm.workModels].sort(),
    loc: needsLocation.value ? profileForm.location : ''
  })
}

// ---- Stack chips ----
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
  if (stackDraft.value === '' && profileForm.stack.length) profileForm.stack.pop()
}

// ---- Navegação do wizard ----
function stepValid(n: number): boolean {
  if (n === 1) {
    if (stackDraft.value.trim()) addStackTag()
    return profileForm.stack.length > 0
  }
  if (n === 2) {
    if (profileForm.areas.length === 0) return false
    if (profileForm.workModels.length === 0) return false
    if (needsLocation.value && !profileForm.location.trim()) return false
    return true
  }
  if (n === 3) return whatsappValid.value
  return true
}
function nextStep() {
  if (!stepValid(step.value)) { stepError.value = true; return }
  stepError.value = false
  if (step.value < steps.length) step.value++
}
function prevStep() {
  stepError.value = false
  if (step.value > 1) step.value--
}
function goToStep(n: number) {
  // Livre para voltar; para avançar exige as etapas anteriores válidas.
  if (n <= step.value) { stepError.value = false; step.value = n; return }
  for (let i = step.value; i < n; i++) {
    if (!stepValid(i)) { step.value = i; stepError.value = true; return }
  }
  stepError.value = false
  step.value = n
}

// ---- Carga / persistência ----
function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

async function fetchProfile() {
  if (!subscriber.value?.id) return
  const { data } = await supabase
    .from('subscriber_profiles')
    .select('*')
    .eq('subscriber_id', subscriber.value.id)
    .maybeSingle()

  profile.value = (data as Profile) ?? null
  if (data) {
    profileForm.whatsapp = data.whatsapp || ''
    profileForm.areas = [...((data as Profile).areas || [])]
    profileForm.stack = [...(data.stack || [])]
    profileForm.seniority = (data.seniority as Seniority) || 'pleno'
    profileForm.workModels = [...((data.work_models || []) as WorkModel[])]
    profileForm.location = data.location || ''

    const p = data as Profile
    editsUsed.value = p.edits_month === currentMonthKey() ? (p.edits_count ?? 0) : 0
  }
  profileSnapshot.value = snapshotOf()
}

async function saveProfile() {
  if (!subscriber.value || !profileChanged.value || quotaReached.value) return
  if (stackDraft.value.trim()) addStackTag()

  // Valida todas as etapas antes de enviar.
  for (let i = 1; i <= steps.length; i++) {
    if (!stepValid(i)) { step.value = i; stepError.value = true; return }
  }
  stepError.value = false

  loadingProfile.value = true
  profileAlert.text = ''
  try {
    const { data, error } = await (supabase as any).rpc('save_search_profile', {
      p_whatsapp: profileForm.whatsapp,
      p_areas: profileForm.areas,
      p_stack: profileForm.stack,
      p_seniority: profileForm.seniority,
      p_work_models: profileForm.workModels,
      p_location: needsLocation.value ? profileForm.location : null
    })
    if (error) throw error

    if (data?.used != null) editsUsed.value = data.used
    profileAlert.type = 'success'
    profileAlert.text = data?.remaining > 0
      ? `Perfil atualizado. Você ainda pode alterar ${data.remaining}× este mês.`
      : 'Perfil atualizado. Foi sua última alteração deste mês.'
    await fetchProfile()
  } catch (err: any) {
    profileAlert.type = 'error'
    const msg = String(err?.message || '')
    if (msg.includes('edit_limit_reached')) {
      editsUsed.value = EDIT_LIMIT
      profileAlert.text = `Limite de ${EDIT_LIMIT} alterações por mês atingido.`
    } else {
      profileAlert.text = 'Não foi possível salvar agora. Tente novamente.'
    }
  } finally {
    loadingProfile.value = false
  }
}

onMounted(fetchProfile)
</script>

<style scoped>
.dset {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ---------- Card ---------- */
.dset-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
}

.dset-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.dset-card__heading { display: flex; gap: var(--space-3); align-items: flex-start; }
.dset-card__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}
.dset-card__head h2 {
  margin: 0 0 2px;
  font-size: var(--text-xl);
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

/* Quota */
.dset-quota {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.dset-quota strong { color: var(--color-text-primary); font-weight: var(--font-bold); }
.dset-quota--out {
  background: var(--color-warning-soft);
  border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
  color: var(--color-warning);
}
.dset-quota--out strong { color: var(--color-warning); }

/* ---------- Stepper ---------- */
.dset-steps {
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0;
  display: flex;
  gap: var(--space-2);
}
.dset-step { flex: 1; min-width: 0; }
.dset-step__btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}
.dset-step__btn:hover { border-color: var(--color-text-muted); }
.dset-step__mark {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  color: var(--color-text-muted);
}
.dset-step__label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dset-step--active .dset-step__btn {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.dset-step--active .dset-step__mark {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-inverse);
}
.dset-step--active .dset-step__label { color: var(--color-accent); font-weight: var(--font-semibold); }
.dset-step--done .dset-step__mark {
  background: var(--color-success);
  border-color: var(--color-success);
  color: var(--color-text-inverse);
}
@media (max-width: 560px) {
  .dset-step__label { display: none; }
  .dset-step__btn { justify-content: center; }
}

/* ---------- Form ---------- */
.dset-form { display: flex; flex-direction: column; gap: var(--space-5); }
.dset-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}
@media (min-width: 640px) {
  .dset-grid { grid-template-columns: 1fr 1fr; }
}
.dset-pane { display: flex; flex-direction: column; gap: var(--space-5); }

.form-input {
  background: var(--color-surface);
  border-radius: var(--radius-input);
  padding: var(--space-3) var(--space-4);
}
.form-input:disabled { opacity: 0.5; cursor: not-allowed; }
.form-input:focus:not(:disabled) { background: var(--color-surface-elevated); }

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
.dset-field-error {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-error);
  font-weight: var(--font-medium);
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
.chip-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
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

/* Revisão */
.dset-review {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.dset-review__title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  font-weight: var(--font-bold);
  color: var(--color-text-muted);
}
.dset-review__list { margin: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.dset-review__list div { display: flex; flex-direction: column; gap: 2px; }
.dset-review__list dt {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
}
.dset-review__list dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-medium);
}

/* Navegação do wizard */
.dset-wizard-nav { display: flex; align-items: center; gap: var(--space-3); }
.dset-wizard-nav__spacer { flex: 1; }

/* Ações */
.dset-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  align-items: center;
}

/* Alertas */
.dset-alert {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
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
.dset-alert--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
}
.dset-inline-alert { font-size: var(--text-sm); font-weight: var(--font-medium); }
.dset-inline-alert--success { color: var(--color-success); }
.dset-inline-alert--error { color: var(--color-error); }

/* Free upgrade card */
.dset-card--upgrade {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-10) var(--space-6);
}
.dset-card__icon--lg { width: 52px; height: 52px; }
.dset-card--upgrade h2 { font-size: var(--text-2xl); margin: var(--space-2) 0 0; line-height: var(--lh-title); }
.dset-card--upgrade p { margin: 0; color: var(--color-text-secondary); max-width: 380px; line-height: var(--lh-body); }
</style>
