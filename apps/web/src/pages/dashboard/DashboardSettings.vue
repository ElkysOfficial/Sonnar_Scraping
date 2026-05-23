<template>
  <div class="dset">
    <!-- ====================== TABS ====================== -->
    <nav class="dset-tabs" role="tablist" aria-label="Seções de configuração">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'conta'"
        class="dset-tab"
        :class="{ 'dset-tab--active': tab === 'conta' }"
        @click="setTab('conta')"
      >Conta</button>
      <button
        v-if="subscriber?.plan !== 'free'"
        type="button"
        role="tab"
        :aria-selected="tab === 'perfil'"
        class="dset-tab"
        :class="{ 'dset-tab--active': tab === 'perfil' }"
        @click="setTab('perfil')"
      >Perfil de busca</button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'assinatura'"
        class="dset-tab"
        :class="{ 'dset-tab--active': tab === 'assinatura' }"
        @click="setTab('assinatura')"
      >Assinatura</button>
    </nav>

    <!-- ====================== ABA: CONTA ====================== -->
    <section v-show="tab === 'conta'" class="dset-card">
      <header class="dset-card__head">
        <h2>Conta</h2>
        <p>Seus dados pessoais, contato e endereço.</p>
      </header>

      <form class="dset-form" novalidate @submit.prevent="saveAccount">
        <!-- Identidade -->
        <fieldset class="dset-fieldset">
          <legend class="dset-fieldset__legend">Identidade</legend>
          <div class="dset-grid">
            <div class="form-group">
              <label for="set-name" class="form-label">Nome</label>
              <input id="set-name" v-model.trim="accountForm.name" type="text" class="form-input" autocomplete="given-name" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-surname" class="form-label">Sobrenome</label>
              <input id="set-surname" v-model.trim="accountForm.surname" type="text" class="form-input" autocomplete="family-name" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-email" class="form-label">E-mail</label>
              <input id="set-email" :value="subscriber?.email" type="email" class="form-input" disabled readonly />
              <p class="form-hint">É o seu login. Fale com o suporte para alterar.</p>
            </div>
            <div class="form-group">
              <label for="set-birth" class="form-label">Data de nascimento</label>
              <input id="set-birth" v-model="accountForm.birth_date" type="date" class="form-input" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-phone" class="form-label">Telefone / WhatsApp</label>
              <input id="set-phone" v-model="accountForm.phone" type="tel" class="form-input" placeholder="(11) 99999-9999" autocomplete="tel" :disabled="loadingAccount" />
            </div>
          </div>
        </fieldset>

        <!-- Documento -->
        <fieldset class="dset-fieldset">
          <legend class="dset-fieldset__legend">Documento</legend>
          <div class="dset-grid">
            <div class="form-group dset-grid__col-full">
              <label class="form-label">Tipo</label>
              <div class="chip-row">
                <label class="chip-option" :class="{ 'chip-option--active': accountForm.person_type === 'fisica' }">
                  <input v-model="accountForm.person_type" type="radio" value="fisica" :disabled="loadingAccount" />
                  <span>Pessoa física</span>
                </label>
                <label class="chip-option" :class="{ 'chip-option--active': accountForm.person_type === 'juridica' }">
                  <input v-model="accountForm.person_type" type="radio" value="juridica" :disabled="loadingAccount" />
                  <span>Pessoa jurídica</span>
                </label>
              </div>
            </div>
            <div v-if="!isPJ" class="form-group">
              <label for="set-cpf" class="form-label">CPF</label>
              <input id="set-cpf" v-model="accountForm.cpf" type="text" class="form-input" placeholder="000.000.000-00" :disabled="loadingAccount" />
            </div>
            <template v-else>
              <div class="form-group">
                <label for="set-cnpj" class="form-label">CNPJ</label>
                <input id="set-cnpj" v-model="accountForm.cnpj" type="text" class="form-input" placeholder="00.000.000/0000-00" :disabled="loadingAccount" />
              </div>
              <div class="form-group">
                <label for="set-legal" class="form-label">Razão social</label>
                <input id="set-legal" v-model.trim="accountForm.legal_name" type="text" class="form-input" :disabled="loadingAccount" />
              </div>
            </template>
          </div>
        </fieldset>

        <!-- Endereço -->
        <fieldset class="dset-fieldset">
          <legend class="dset-fieldset__legend">Endereço</legend>
          <div class="dset-grid">
            <div class="form-group">
              <label for="set-cep" class="form-label">CEP</label>
              <input id="set-cep" v-model="accountForm.cep" type="text" class="form-input" placeholder="00000-000" autocomplete="postal-code" :disabled="loadingAccount" />
            </div>
            <div class="form-group dset-grid__col-2">
              <label for="set-street" class="form-label">Rua / Logradouro</label>
              <input id="set-street" v-model.trim="accountForm.street" type="text" class="form-input" autocomplete="street-address" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-num" class="form-label">Número</label>
              <input id="set-num" v-model.trim="accountForm.street_number" type="text" class="form-input" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-comp" class="form-label">Complemento</label>
              <input id="set-comp" v-model.trim="accountForm.complement" type="text" class="form-input" placeholder="Apto, sala, etc." :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-bairro" class="form-label">Bairro</label>
              <input id="set-bairro" v-model.trim="accountForm.neighborhood" type="text" class="form-input" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-city" class="form-label">Cidade</label>
              <input id="set-city" v-model.trim="accountForm.city" type="text" class="form-input" autocomplete="address-level2" :disabled="loadingAccount" />
            </div>
            <div class="form-group">
              <label for="set-state" class="form-label">UF</label>
              <input id="set-state" v-model="accountForm.state_code" type="text" maxlength="2" class="form-input form-input--centered" autocomplete="address-level1" :disabled="loadingAccount" />
            </div>
          </div>
        </fieldset>

        <div class="dset-actions">
          <button type="submit" class="btn btn-primary" :disabled="loadingAccount || !accountChanged">
            {{ loadingAccount ? 'Salvando…' : 'Salvar alterações' }}
          </button>
          <span v-if="accountAlert.text" :class="['dset-inline-alert', `dset-inline-alert--${accountAlert.type}`]" role="alert">
            {{ accountAlert.text }}
          </span>
        </div>
      </form>

      <!-- Bloco senha -->
      <div class="dset-divider"></div>
      <div class="dset-password">
        <div class="dset-password__info">
          <h3>Senha</h3>
          <p>Sua senha é o que mantém sua conta segura. Recomendamos trocar a cada 90 dias.</p>
        </div>
        <router-link to="/change-password" class="btn btn-secondary">Alterar senha</router-link>
      </div>
    </section>

    <!-- ====================== ABA: PERFIL DE BUSCA ====================== -->
    <section v-show="tab === 'perfil'" v-if="subscriber?.plan !== 'free'" class="dset-card">
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
              Pressione <kbd>Enter</kbd> ou vírgula para adicionar. Até 12 tecnologias.
              Quanto mais específico, melhor o match.
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
                <dd>{{ profileForm.stack.length ? profileForm.stack.join(', ') : 'Não informado' }}</dd>
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
                <dd>{{ profileForm.location || 'Não informado' }}</dd>
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

    <!-- Plano free: card de upgrade na aba de Perfil -->
    <section v-show="tab === 'perfil'" v-if="subscriber?.plan === 'free'" class="dset-card dset-card--upgrade">
      <span class="dset-card__icon dset-card__icon--lg" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" opacity="0.6" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <h2>Perfil de busca personalizado</h2>
      <p>Disponível nos planos Pro e Plus. No plano Comunidade não há filtro personalizado.</p>
      <button type="button" class="btn btn-primary" @click="setTab('assinatura')">Ver planos</button>
    </section>

    <!-- ====================== ABA: ASSINATURA ====================== -->
    <div v-show="tab === 'assinatura'">
      <DashboardSubscription />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import CountryPhoneInput from '@/components/CountryPhoneInput.vue'
import DashboardSubscription from './DashboardSubscription.vue'
import type { Database } from '@/integrations/supabase/types'

// ============== TABS ==============
type Tab = 'conta' | 'perfil' | 'assinatura'
const route = useRoute()
const router = useRouter()

function isValidTab(v: unknown): v is Tab {
  return v === 'conta' || v === 'perfil' || v === 'assinatura'
}
const tab = ref<Tab>(isValidTab(route.query.tab) ? route.query.tab : 'conta')

watch(() => route.query.tab, (q) => {
  if (isValidTab(q)) tab.value = q
})

function setTab(next: Tab) {
  tab.value = next
  router.replace({ query: { ...route.query, tab: next } })
}

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
type AccountForm = {
  name: string
  surname: string
  birth_date: string
  person_type: 'fisica' | 'juridica' | ''
  cpf: string
  cnpj: string
  legal_name: string
  phone: string
  cep: string
  street: string
  street_number: string
  complement: string
  neighborhood: string
  city: string
  state_code: string
}

const blankAccount = (): AccountForm => ({
  name: '', surname: '', birth_date: '', person_type: '',
  cpf: '', cnpj: '', legal_name: '', phone: '',
  cep: '', street: '', street_number: '', complement: '',
  neighborhood: '', city: '', state_code: ''
})

const accountForm = reactive<AccountForm>(blankAccount())
const accountSnapshot = ref('')
const loadingAccount = ref(false)
const accountAlert = reactive<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

const accountChanged = computed(() =>
  JSON.stringify(accountForm) !== accountSnapshot.value && accountForm.name.trim().length >= 2
)

const isPJ = computed(() => accountForm.person_type === 'juridica')

async function loadAccount() {
  if (!subscriber.value?.id) return
  const { data, error } = await supabase
    .from('subscribers')
    .select('name, surname, birth_date, person_type, cpf, cnpj, legal_name, phone, cep, street, street_number, complement, neighborhood, city, state_code')
    .eq('id', subscriber.value.id)
    .maybeSingle()
  if (error || !data) return
  Object.assign(accountForm, {
    name: data.name ?? '',
    surname: data.surname ?? '',
    birth_date: data.birth_date ?? '',
    person_type: (data.person_type as AccountForm['person_type']) ?? '',
    cpf: data.cpf ?? '',
    cnpj: data.cnpj ?? '',
    legal_name: data.legal_name ?? '',
    phone: data.phone ?? '',
    cep: data.cep ?? '',
    street: data.street ?? '',
    street_number: data.street_number ?? '',
    complement: data.complement ?? '',
    neighborhood: data.neighborhood ?? '',
    city: data.city ?? '',
    state_code: data.state_code ?? ''
  })
  accountSnapshot.value = JSON.stringify(accountForm)
}

watch(subscriber, (s) => {
  if (s) loadAccount()
}, { immediate: true })

async function saveAccount() {
  if (!subscriber.value || !accountChanged.value) return
  loadingAccount.value = true
  accountAlert.text = ''
  try {
    const payload: Partial<AccountForm> = { ...accountForm }
    // Limpa o documento que nao se aplica ao tipo
    if (isPJ.value) { payload.cpf = '' } else { payload.cnpj = ''; payload.legal_name = '' }
    const { error } = await supabase
      .from('subscribers')
      .update(payload as any)
      .eq('id', subscriber.value.id)
    if (error) throw error
    accountSnapshot.value = JSON.stringify(accountForm)
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
  seniorityOptions.find(o => o.value === profileForm.seniority)?.label || 'Não informado'
)
const workModelsLabel = computed(() => {
  const labels = profileForm.workModels
    .map(v => workModelOptions.find(o => o.value === v)?.label)
    .filter(Boolean)
  return labels.length ? labels.join(', ') : 'Não informado'
})
const areasLabel = computed(() => {
  const labels = profileForm.areas
    .map(v => areaOptions.find(o => o.value === v)?.label)
    .filter(Boolean)
  return labels.length ? labels.join(', ') : 'Não informado'
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
  gap: var(--space-4);
}

/* ---------- Tabs (estilo hPanel: sem caixa, com underline no ativo) ---------- */
.dset-tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: var(--space-1);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.dset-tab {
  position: relative;
  appearance: none;
  background: transparent;
  border: none;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  transition: color var(--transition-fast), background var(--transition-fast);
  white-space: nowrap;
}
.dset-tab:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
}
.dset-tab--active {
  color: var(--color-text-primary);
}
.dset-tab--active::after {
  content: '';
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: -1px;
  height: 2px;
  background: var(--color-accent);
  border-radius: 2px 2px 0 0;
}

/* ---------- Card ---------- */
.dset-card {
  background: var(--color-background);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
}
@media (max-width: 640px) {
  .dset-card { padding: var(--space-4); }
}

/* Fieldset agrupador: sem borda, com label em destaque */
.dset-fieldset {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.dset-fieldset + .dset-fieldset {
  margin-top: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}
.dset-fieldset__legend {
  font-size: 11px;
  font-weight: var(--font-bold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  padding: 0;
  margin-bottom: var(--space-2);
}
.dset-grid__col-2 { grid-column: span 2; }
@media (max-width: 559px) {
  .dset-grid__col-2 { grid-column: span 1; }
}
@media (min-width: 960px) {
  .dset-grid__col-2 { grid-column: span 2; }
}
.form-input--centered { text-align: center; text-transform: uppercase; }

/* Bloco senha */
.dset-divider {
  height: 1px;
  background: var(--color-border-subtle);
  margin: var(--space-5) 0 var(--space-4);
}
.dset-password {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.dset-password__info { flex: 1; min-width: 240px; }
.dset-password__info h3 {
  margin: 0 0 2px;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
}
.dset-password__info p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

.dset-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}
.dset-card__head h2 {
  margin: 0 0 2px;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
  color: var(--color-text-primary);
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
.dset-form { display: flex; flex-direction: column; gap: var(--space-4); }
.dset-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3) var(--space-4);
}
@media (min-width: 560px) {
  .dset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 960px) {
  .dset-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.dset-pane { display: flex; flex-direction: column; gap: var(--space-4); }

/* Form group local (ajustes finos do espaçamento) */
.dset-form .form-group { margin-bottom: 0; }
.dset-form .form-label {
  font-size: 12px;
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  line-height: 1.3;
}

/* Inputs compactos e profissionais (altura 36px, padding moderado) */
.dset-form .form-input,
.dset-form .form-select {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 var(--space-3);
  height: 36px;
  min-height: 36px;
  font-size: var(--text-sm);
  width: 100%;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.dset-form .form-input:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}
.dset-form .form-input:focus:not(:disabled) {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
  outline: none;
}
.dset-form .form-input:disabled {
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 1;
}

.form-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
  line-height: 1.4;
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
