<template>
  <main class="auth-page signup-page">
    <!-- Painel decorativo (desktop) -->
    <aside class="auth-panel-left">
      <div class="auth-panel-content">
        <router-link to="/" class="auth-panel-logo" aria-label="Voltar para a home">
          <div class="auth-logo-mark">S</div>
          <span class="auth-logo-text">Sonnar</span>
        </router-link>

        <div class="auth-panel-tagline">
          <h2>Vagas do seu stack,</h2>
          <h2>direto no WhatsApp.</h2>
        </div>

        <p class="auth-panel-description">{{ planCopy.heroDescription }}</p>

        <div class="auth-panel-mockup">
          <WhatsAppPhoneMockup size="compact" :tilt="false" />
        </div>
      </div>
    </aside>

    <!-- Formulário -->
    <section class="auth-panel-right">
      <div class="auth-form-container signup-container">
        <header class="auth-mobile-header">
          <router-link to="/" class="auth-logo-link" aria-label="Voltar para a home">
            <div class="auth-logo-mark-sm">S</div>
            <span class="auth-logo-text-sm">Sonnar</span>
          </router-link>
        </header>

        <!-- Indicador de progresso (so depois de escolher plano) -->
        <div
          v-if="totalSteps > 1 && step !== 'done' && step !== 'plan-select'"
          class="signup-progress"
          :aria-label="`Etapa ${stepIndex + 1} de ${totalSteps}`"
          role="progressbar"
          :aria-valuenow="stepIndex + 1"
          :aria-valuemin="1"
          :aria-valuemax="totalSteps"
        >
          <span
            v-for="n in totalSteps"
            :key="n"
            class="signup-progress__seg"
            :class="{ 'signup-progress__seg--on': stepIndex >= n - 1 }"
          />
        </div>

        <div v-if="alert.text" :class="['auth-alert', `auth-alert-${alert.type}`]" role="alert">
          <span>{{ alert.text }}</span>
        </div>

        <!-- ============ STEP 0 — Selecao de plano ============ -->
        <template v-if="step === 'plan-select'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">Cadastro</p>
            <h1 class="auth-form-title">Escolha seu plano</h1>
            <p class="auth-form-subtitle">Você pode mudar a qualquer momento.</p>
          </div>

          <div class="plan-select-list" role="radiogroup" aria-label="Escolha de plano">
            <button
              v-for="opt in planOptions"
              :key="opt.tier"
              type="button"
              role="radio"
              :aria-checked="false"
              class="plan-select-card"
              :class="{ 'plan-select-card--featured': opt.featured }"
              @click="selectPlan(opt.tier)"
            >
              <div v-if="opt.featured" class="plan-select-badge">Mais Popular</div>
              <div class="plan-select-card__top">
                <div>
                  <span class="plan-select-eyebrow">{{ opt.label }}</span>
                  <span class="plan-select-price">{{ opt.price }}</span>
                </div>
                <span v-if="opt.trial" class="plan-select-trial">7 dias grátis</span>
              </div>
              <p class="plan-select-tagline">{{ opt.tagline }}</p>
              <span class="plan-select-arrow" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </button>
          </div>

          <p class="auth-help-text">
            Já tem conta?
            <router-link to="/login" class="auth-help-link">Entrar</router-link>
          </p>
        </template>

        <!-- ============ STEP 1 — Conta ============ -->
        <template v-else-if="step === 'account'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Crie sua conta</h1>
            <p class="auth-form-subtitle">Comece com seus dados de acesso.</p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitAccount">
            <div class="form-group">
              <label for="su-email" class="form-label">E-mail</label>
              <input
                id="su-email"
                v-model.trim="form.email"
                type="email"
                class="form-input"
                autocomplete="email"
                inputmode="email"
                placeholder="seu@email.com"
                required
                :disabled="loading"
                @input="errors.email = ''"
              />
              <p v-if="errors.email" class="form-error">{{ errors.email }}</p>
            </div>

            <div class="form-group">
              <label for="su-password" class="form-label">Senha</label>
              <div class="auth-input-wrapper">
                <input
                  id="su-password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-input"
                  autocomplete="new-password"
                  placeholder="Crie uma senha forte"
                  required
                  :disabled="loading"
                  @input="errors.password = ''"
                />
                <button
                  type="button"
                  class="auth-password-toggle"
                  :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.password" class="form-error">{{ errors.password }}</p>
              <PasswordStrength :password="form.password" />
            </div>

            <div class="signup-actions">
              <button type="submit" class="btn btn-primary btn-lg w-full" :disabled="loading">
                Continuar
              </button>
            </div>
          </form>

          <p class="auth-help-text">
            Já tem conta?
            <router-link to="/login" class="auth-help-link">Entrar</router-link>
          </p>

          <p class="signup-legal">
            Ao criar conta você aceita nossos
            <router-link to="/termos" class="auth-help-link">Termos</router-link> e a
            <router-link to="/privacidade" class="auth-help-link">Política de Privacidade</router-link>.
          </p>
        </template>

        <!-- ============ STEP 2 — Dados pessoais ============ -->
        <template v-else-if="step === 'personal'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Seus dados pessoais</h1>
            <p class="auth-form-subtitle">Para personalizar suas mensagens e recibos.</p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitPersonal">
            <div class="form-grid form-grid--2">
              <div class="form-group">
                <label for="su-name" class="form-label">Nome</label>
                <input
                  id="su-name"
                  v-model.trim="form.name"
                  type="text"
                  class="form-input"
                  autocomplete="given-name"
                  placeholder="Maria"
                  required
                  :disabled="loading"
                  @input="errors.name = ''"
                />
                <p v-if="errors.name" class="form-error">{{ errors.name }}</p>
              </div>

              <div class="form-group">
                <label for="su-surname" class="form-label">Sobrenome</label>
                <input
                  id="su-surname"
                  v-model.trim="form.surname"
                  type="text"
                  class="form-input"
                  autocomplete="family-name"
                  placeholder="Silva"
                  required
                  :disabled="loading"
                  @input="errors.surname = ''"
                />
                <p v-if="errors.surname" class="form-error">{{ errors.surname }}</p>
              </div>
            </div>

            <div class="form-group">
              <label for="su-birth" class="form-label">Data de nascimento</label>
              <input
                id="su-birth"
                v-model="form.birthDate"
                type="date"
                class="form-input"
                autocomplete="bday"
                :max="maxBirthDate"
                :min="minBirthDate"
                required
                :disabled="loading"
                @input="errors.birthDate = ''"
              />
              <p v-if="errors.birthDate" class="form-error">{{ errors.birthDate }}</p>
            </div>

            <div class="form-group">
              <label class="form-label">Telefone</label>
              <CountryPhoneInput
                v-model="form.phone"
                :default-iso="'BR'"
                :disabled="loading"
                :invalid="!!errors.phone"
                placeholder="99 99999-9999"
                required
                @change="errors.phone = ''"
              />
              <p v-if="errors.phone" class="form-error">{{ errors.phone }}</p>
              <p class="form-hint">{{ phoneHint }}</p>
            </div>

            <div class="signup-actions signup-actions--split">
              <button type="button" class="btn btn-ghost btn-lg" :disabled="loading" @click="goBack">
                Voltar
              </button>
              <button type="submit" class="btn btn-primary btn-lg" :disabled="loading">
                <span v-if="!loading">{{ plan === 'free' ? 'Criar conta grátis' : 'Continuar' }}</span>
                <span v-else>Aguarde…</span>
              </button>
            </div>
          </form>
        </template>

        <!-- ============ STEP 3 — Perfil profissional (Pro/Plus) ============ -->
        <template v-else-if="step === 'profile'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Perfil profissional</h1>
            <p class="auth-form-subtitle">Esses dados filtram as vagas que vamos te enviar.</p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitProfile">
            <div class="form-group">
              <span class="form-label">Senioridade</span>
              <div class="radio-group">
                <label
                  v-for="opt in seniorityOptions"
                  :key="opt.value"
                  class="chip-option"
                  :class="{ 'chip-option--active': form.seniority === opt.value }"
                >
                  <input
                    v-model="form.seniority"
                    type="radio"
                    name="seniority"
                    :value="opt.value"
                    :disabled="loading"
                    @change="errors.seniority = ''"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
              <p v-if="errors.seniority" class="form-error">{{ errors.seniority }}</p>
            </div>

            <div class="form-group">
              <span class="form-label">Stack</span>
              <p class="form-hint" :class="{ 'form-hint--error': errors.stack }">
                Selecione tudo que você usa. Quanto mais, mais vagas você recebe.
              </p>
              <div class="stack-picker" :class="{ 'stack-picker--invalid': errors.stack }">
                <div v-for="group in STACK_GROUPS" :key="group.category" class="stack-group">
                  <p class="stack-group__title">{{ group.category }}</p>
                  <div class="stack-group__chips">
                    <button
                      v-for="item in group.items"
                      :key="item"
                      type="button"
                      class="chip-option"
                      :class="{ 'chip-option--active': form.stack.includes(item) }"
                      :disabled="loading"
                      @click="toggleStack(item)"
                    >
                      {{ item }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="stack-meta">
                <p v-if="errors.stack" class="form-error">{{ errors.stack }}</p>
                <p v-else-if="form.stack.length > 0" class="stack-counter">
                  {{ form.stack.length }} {{ form.stack.length === 1 ? 'tecnologia selecionada' : 'tecnologias selecionadas' }}
                </p>
                <p v-else class="form-hint signup-note-inline">
                  Por enquanto só vagas remotas — em breve híbridas e presenciais.
                </p>
              </div>
            </div>

            <div class="signup-actions signup-actions--split">
              <button type="button" class="btn btn-ghost btn-lg" :disabled="loading" @click="goBack">
                Voltar
              </button>
              <button type="submit" class="btn btn-primary btn-lg" :disabled="loading">
                <span v-if="!loading">Finalizar cadastro</span>
                <span v-else>Criando conta…</span>
              </button>
            </div>
          </form>
        </template>

        <!-- ============ STEP DONE ============ -->
        <template v-else>
          <div class="signup-success">
            <div class="signup-success__pulse" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="32" cy="32" r="5" fill="currentColor" stroke="none" />
                <circle cx="32" cy="32" r="14" opacity="0.55" />
                <circle cx="32" cy="32" r="22" opacity="0.3" />
              </svg>
            </div>

            <template v-if="confirmingCheckout">
              <h1 class="auth-form-title">Tudo certo!</h1>
              <p class="auth-form-subtitle signup-success__lead">Levando você para a tela de pagamento…</p>
            </template>
            <template v-else>
              <h1 class="auth-form-title">Confirme seu e-mail</h1>
              <p class="auth-form-subtitle signup-success__lead">
                Enviamos um link para <strong>{{ form.email }}</strong>.
              </p>
              <p class="signup-success__hint">
                <span class="signup-success__dot" aria-hidden="true"></span>
                Aguardando confirmação…
              </p>
              <p v-if="confirmHint" class="signup-success__warn">{{ confirmHint }}</p>

              <div class="signup-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-lg w-full"
                  :disabled="checkingNow"
                  @click="manualCheck"
                >
                  <span v-if="!checkingNow">Já confirmei meu e-mail</span>
                  <span v-else>Verificando…</span>
                </button>
              </div>
            </template>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import type { Subscription } from '@supabase/supabase-js'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import CountryPhoneInput from '@/components/CountryPhoneInput.vue'
import WhatsAppPhoneMockup from '@/components/WhatsAppPhoneMockup.vue'
import PasswordStrength from '@/components/PasswordStrength.vue'
import { STACK_GROUPS } from '@/data/stacks'

type Plan = 'free' | 'pro' | 'plus'
type Seniority = 'junior' | 'pleno' | 'senior' | 'staff_lead'
type Step = 'plan-select' | 'account' | 'personal' | 'profile' | 'done'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()

function parsePlanFromRoute(value: unknown): Plan | null {
  const p = typeof value === 'string' ? value.toLowerCase() : ''
  return p === 'pro' || p === 'plus' || p === 'free' ? p : null
}

// plan eh um ref (nao computed) pra suportar fluxo onde usuario escolhe na tela.
// Inicializa a partir da URL; null quando nenhum plano valido.
const plan = ref<Plan | null>(parsePlanFromRoute(route.params.plan))

// Sincroniza plan -> URL quando usuario escolhe e tambem URL -> plan
// quando usuario navega pra tras (browser back).
watch(() => route.params.plan, (newVal) => {
  const parsed = parsePlanFromRoute(newVal)
  if (parsed !== plan.value) plan.value = parsed
})

const planLabel = computed(() => {
  if (!plan.value) return 'Selecione um plano'
  return ({
    free: 'Plano Comunidade · Grátis',
    pro: 'Plano Pro · R$ 5/mês',
    plus: 'Plano Plus · R$ 10/mês'
  } as const)[plan.value]
})

const planCopy = computed(() => ({
  heroDescription: !plan.value
    ? 'Escolha o plano que faz sentido pra sua jornada.'
    : plan.value === 'free'
      ? 'Faça parte do ecossistema Sonnar e troque ideia com outros devs.'
      : 'Vagas filtradas pelo seu perfil, entregues onde você já lê.'
}))

// Steps reais (sem plan-select): Free 2, Pro/Plus 3.
const totalSteps = computed(() => {
  if (!plan.value) return 0
  return plan.value === 'free' ? 2 : 3
})

const step = ref<Step>(plan.value ? 'account' : 'plan-select')

const stepIndex = computed(() => {
  if (step.value === 'plan-select') return -1
  if (step.value === 'account')  return 0
  if (step.value === 'personal') return 1
  if (step.value === 'profile')  return 2
  return totalSteps.value - 1
})

// Opcoes mostradas na tela de selecao de plano.
const planOptions = [
  {
    tier: 'free' as const,
    label: 'Comunidade',
    price: 'Grátis',
    tagline: 'Comunidade no Discord, WhatsApp e Telegram.',
    featured: false
  },
  {
    tier: 'plus' as const,
    label: 'Plus',
    price: 'R$ 10/mês',
    tagline: 'IA + curadoria humana. Para quem busca direcionamento.',
    featured: true,
    trial: true
  },
  {
    tier: 'pro' as const,
    label: 'Pro',
    price: 'R$ 5/mês',
    tagline: 'Canal exclusivo no WhatsApp com filtros automáticos.',
    featured: false,
    trial: true
  }
]

function selectPlan(p: Plan) {
  plan.value = p
  step.value = 'account'
  // Atualiza URL pra refletir o plano escolhido (browser back funciona)
  router.replace({ name: 'Signup', params: { plan: p } })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const phoneHint = computed(() =>
  plan.value === 'free'
    ? 'Para contato e avisos importantes da plataforma.'
    : 'É no WhatsApp que enviamos as vagas. Não compartilhamos com ninguém.'
)

// Limites para a data de nascimento — minimo 14 anos, max 100 anos.
const today = new Date()
const maxBirthDate = computed(() => {
  const d = new Date(today)
  d.setFullYear(d.getFullYear() - 14)
  return d.toISOString().slice(0, 10)
})
const minBirthDate = computed(() => {
  const d = new Date(today)
  d.setFullYear(d.getFullYear() - 100)
  return d.toISOString().slice(0, 10)
})

const loading = ref(false)
const showPassword = ref(false)
const alert = reactive<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

const awaitingEmailConfirm = ref(false)
const confirmingCheckout = ref(false)
const checkingNow = ref(false)
const confirmHint = ref('')
let authSub: Subscription | null = null
let confirmPollTimer: ReturnType<typeof setInterval> | null = null
let confirmPollDelayTimer: ReturnType<typeof setTimeout> | null = null
const POLL_INTERVAL_MS = 20000
const POLL_MAX_ATTEMPTS = 15 // 20s * 15 = 5 min
const POLL_INITIAL_DELAY_MS = 15000 // dá tempo do onAuthStateChange disparar antes de poluir console com 400

function clearConfirmPoll() {
  if (confirmPollTimer) {
    clearInterval(confirmPollTimer)
    confirmPollTimer = null
  }
  if (confirmPollDelayTimer) {
    clearTimeout(confirmPollDelayTimer)
    confirmPollDelayTimer = null
  }
}

const form = reactive({
  email: '',
  password: '',
  name: '',
  surname: '',
  birthDate: '',
  phone: '',
  stack: [] as string[],
  seniority: '' as Seniority | ''
})

const errors = reactive({
  email: '', password: '',
  name: '', surname: '', birthDate: '', phone: '',
  stack: '', seniority: ''
})

const seniorityOptions: { value: Seniority; label: string }[] = [
  { value: 'junior',     label: 'Júnior' },
  { value: 'pleno',      label: 'Pleno' },
  { value: 'senior',     label: 'Sênior' },
  { value: 'staff_lead', label: 'Staff / Lead' }
]

function toggleStack(item: string) {
  const i = form.stack.indexOf(item)
  if (i >= 0) form.stack.splice(i, 1)
  else form.stack.push(item)
  if (form.stack.length > 0) errors.stack = ''
}

function goBack() {
  clearAlert()
  if (step.value === 'profile')   step.value = 'personal'
  else if (step.value === 'personal') step.value = 'account'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  if (isAuthenticated.value) router.replace('/dashboard')

  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!awaitingEmailConfirm.value) return
    if (event !== 'SIGNED_IN' || !session) return
    clearConfirmPoll()
    awaitingEmailConfirm.value = false
    await goToCheckoutOrDashboard()
  })
  authSub = data.subscription
})

onUnmounted(() => {
  authSub?.unsubscribe()
  clearConfirmPoll()
})

// Tenta logar com email/senha (silencioso). Se sucesso, dispara checkout.
// Se erro for "email not confirmed", continua polling. Outros erros param o poll.
async function tryConfirmCheck(): Promise<'confirmed' | 'pending' | 'error'> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password
  })
  if (data?.session) return 'confirmed'
  const msg = (error?.message ?? '').toLowerCase()
  if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirmation')) {
    return 'pending'
  }
  return 'error'
}

function startConfirmPoll() {
  clearConfirmPoll()
  let attempts = 0
  // Atrasa o início: onAuthStateChange normalmente resolve antes do polling começar,
  // evitando 400s desnecessários no console quando o usuário confirma na mesma máquina.
  confirmPollDelayTimer = setTimeout(() => {
    confirmPollDelayTimer = null
    confirmPollTimer = setInterval(async () => {
      attempts++
      if (attempts > POLL_MAX_ATTEMPTS) {
        clearConfirmPoll()
        confirmHint.value = 'Ainda não detectamos a confirmação. Clique em "Já confirmei" abaixo.'
        return
      }
      const result = await tryConfirmCheck()
      if (result === 'confirmed') {
        clearConfirmPoll()
        // onAuthStateChange tambem deve disparar; chamamos direto pra ser instant.
        awaitingEmailConfirm.value = false
        await goToCheckoutOrDashboard()
      } else if (result === 'error') {
        clearConfirmPoll()
        confirmHint.value = 'Algo deu errado verificando o status. Use o botão "Já confirmei".'
      }
    }, POLL_INTERVAL_MS)
  }, POLL_INITIAL_DELAY_MS)
}

async function manualCheck() {
  if (checkingNow.value) return
  checkingNow.value = true
  confirmHint.value = ''
  try {
    const result = await tryConfirmCheck()
    if (result === 'confirmed') {
      clearConfirmPoll()
      awaitingEmailConfirm.value = false
      await goToCheckoutOrDashboard()
      return
    }
    if (result === 'pending') {
      confirmHint.value = 'Email ainda não confirmado. Verifique sua caixa (ou spam) e clique no link.'
      return
    }
    confirmHint.value = 'Não conseguimos verificar agora. Tente novamente em alguns segundos.'
  } finally {
    checkingNow.value = false
  }
}

async function goToCheckoutOrDashboard() {
  if (plan.value === 'free') {
    window.location.href = '/dashboard'
    return
  }
  confirmingCheckout.value = true
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { plan: plan.value }
    })
    if (error) throw error
    if (data?.checkoutUrl) {
      window.location.href = data.checkoutUrl
      return
    }
  } catch (err) {
    console.error('Checkout invoke error:', err)
  }
  window.location.href = '/pagar'
}

function setAlert(type: 'error' | 'success', text: string) {
  alert.type = type
  alert.text = text
}
function clearAlert() {
  alert.text = ''
  alert.type = ''
}
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

function validateAccount() {
  let ok = true
  if (!isValidEmail(form.email)) { errors.email = 'E-mail inválido.'; ok = false }

  const pwd = form.password
  const failures: string[] = []
  if (pwd.length < 8) failures.push('mínimo 8 caracteres')
  if (!/[A-Z]/.test(pwd)) failures.push('uma maiúscula')
  if (!/[a-z]/.test(pwd)) failures.push('uma minúscula')
  if (!/[0-9]/.test(pwd)) failures.push('um número')
  if (!/[^A-Za-z0-9]/.test(pwd)) failures.push('um caractere especial')
  if (failures.length > 0) {
    errors.password = `Senha precisa de: ${failures.join(', ')}.`
    ok = false
  }
  return ok
}

function validatePersonal() {
  let ok = true
  if (form.name.length < 2)    { errors.name    = 'Nome inválido.'; ok = false }
  if (form.surname.length < 2) { errors.surname = 'Sobrenome inválido.'; ok = false }
  if (!form.birthDate)         { errors.birthDate = 'Data de nascimento obrigatória.'; ok = false }
  else {
    // Re-checa age >= 14
    const dob = new Date(form.birthDate)
    if (Number.isNaN(dob.getTime())) {
      errors.birthDate = 'Data inválida.'; ok = false
    } else {
      const ageMs = Date.now() - dob.getTime()
      const ageYrs = ageMs / (365.25 * 24 * 60 * 60 * 1000)
      if (ageYrs < 14) { errors.birthDate = 'Idade mínima: 14 anos.'; ok = false }
      else if (ageYrs > 100) { errors.birthDate = 'Data inválida.'; ok = false }
    }
  }
  if (form.phone.length < 10) { errors.phone = 'Telefone inválido. Inclua o DDD.'; ok = false }
  return ok
}

function validateProfile() {
  let ok = true
  if (!form.seniority) { errors.seniority = 'Escolha sua senioridade.'; ok = false }
  if (form.stack.length === 0) { errors.stack = 'Selecione pelo menos uma tecnologia.'; ok = false }
  return ok
}

function onSubmitAccount() {
  clearAlert()
  if (!validateAccount()) return
  step.value = 'personal'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function onSubmitPersonal() {
  clearAlert()
  if (!validatePersonal()) return
  if (plan.value === 'free') submitSignup()
  else { step.value = 'profile'; window.scrollTo({ top: 0, behavior: 'smooth' }) }
}

function onSubmitProfile() {
  clearAlert()
  if (!validateProfile()) return
  submitSignup()
}

async function submitSignup() {
  loading.value = true
  try {
    const metadata: Record<string, unknown> = {
      name: form.name,
      surname: form.surname,
      birth_date: form.birthDate,
      phone: form.phone,
      plan: plan.value
    }

    if (plan.value !== 'free') {
      metadata.profile = {
        whatsapp: form.phone,
        stack: form.stack,
        seniority: form.seniority,
        work_models: ['remote'],
        min_salary: null,
        location: null
      }
    }

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/login`
      }
    })

    if (error) throw error

    if (plan.value === 'free') {
      step.value = 'done'
      awaitingEmailConfirm.value = true
      startConfirmPoll()
      window.scrollTo({ top: 0 })
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password
    })

    if (signInError) {
      step.value = 'done'
      awaitingEmailConfirm.value = true
      startConfirmPoll()
      window.scrollTo({ top: 0 })
      return
    }

    const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
      'create-checkout-session',
      { body: { plan: plan.value } }
    )

    if (checkoutError || !checkoutData?.checkoutUrl) {
      window.location.href = '/dashboard/assinatura?upgrade=pending'
      return
    }
    window.location.href = checkoutData.checkoutUrl
  } catch (err) {
    const raw = err instanceof Error ? err.message.toLowerCase() : ''
    const status: number | undefined = err && typeof err === 'object' ? (err as { status?: number }).status : undefined

    let msg = 'Não foi possível criar sua conta. Tente novamente.'
    if (status === 429 || raw.includes('rate limit') || raw.includes('too many')) {
      msg = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
    } else if (raw.includes('already registered') || raw.includes('user already') || raw.includes('already exists')) {
      msg = 'Já existe uma conta com esse e-mail. Tente fazer login.'
    } else if (raw.includes('password')) {
      msg = 'A senha não atende aos requisitos. Verifique os critérios.'
    } else if (raw.includes('email') && raw.includes('invalid')) {
      msg = 'E-mail inválido.'
    } else if (raw.includes('network') || raw.includes('failed to fetch')) {
      msg = 'Sem conexão com o servidor. Tente novamente.'
    }
    setAlert('error', msg)
    if (step.value !== 'account') step.value = 'account'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
@import '@/assets/auth-pages.css';

/* ==========================================================================
   Container
   ========================================================================== */
.signup-container {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ==========================================================================
   Plan select — cards de selecao na primeira tela do cadastro
   ========================================================================== */
.plan-select-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.plan-select-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}
.plan-select-card:hover {
  border-color: var(--color-accent);
  background: var(--color-surface-elevated);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px -8px var(--color-primary-glow);
}
.plan-select-card:focus-visible {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.plan-select-card--featured {
  border-color: var(--color-accent);
  background: linear-gradient(180deg, var(--color-accent-soft), var(--color-surface));
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}

.plan-select-badge {
  position: absolute;
  top: -10px;
  right: var(--space-4);
  padding: 3px 10px;
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 999px;
  box-shadow: 0 4px 12px -4px var(--color-primary-glow);
}

.plan-select-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.plan-select-eyebrow {
  display: block;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: 4px;
}

.plan-select-price {
  display: block;
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.plan-select-tagline {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.45;
}

.plan-select-trial {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  white-space: nowrap;
  flex-shrink: 0;
}

.plan-select-arrow {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
  display: grid;
  place-items: center;
  transition: color var(--transition-fast), transform var(--transition-fast);
  pointer-events: none;
}
.plan-select-card:hover .plan-select-arrow {
  color: var(--color-accent);
  transform: translateY(-50%) translateX(2px);
}

/* ==========================================================================
   Indicador de progresso — segmentos discretos
   ========================================================================== */
.signup-progress {
  display: flex;
  gap: 6px;
  width: 100%;
  max-width: 240px;
  margin: 0 auto;
}
.signup-progress__seg {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background-color var(--transition-base);
}
.signup-progress__seg--on { background: var(--color-accent); }

/* ==========================================================================
   Header (eyebrow + title + subtitle)
   ========================================================================== */
.signup-eyebrow {
  font-size: 0.6875rem;
  font-weight: var(--font-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin: 0 0 var(--space-2);
}

/* ==========================================================================
   Form helpers
   ========================================================================== */
.form-error { font-size: 0.8125rem; color: var(--color-error); margin-top: var(--space-1); }
.form-hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-top: var(--space-1);
  line-height: 1.5;
}
.form-hint--error { color: var(--color-error); }

.form-input {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
}
.form-input:focus { background: var(--color-surface-elevated); }

/* date input nativo */
.form-input[type="date"] {
  font-family: inherit;
  color: var(--color-text-primary);
}

/* form-grid: usado pra deixar nome+sobrenome lado a lado em desktop */
.form-grid {
  display: grid;
  gap: var(--space-3);
}
.form-grid--2 { grid-template-columns: 1fr; }
@media (min-width: 480px) {
  .form-grid--2 { grid-template-columns: 1fr 1fr; }
}

/* Toggle senha */
.auth-input-wrapper { position: relative; }
.auth-input-wrapper .form-input { padding-right: 3rem; }
.auth-password-toggle {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: var(--space-2);
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: color var(--transition-fast);
}
.auth-password-toggle:hover { color: var(--color-text-primary); }
.auth-password-toggle svg { width: 1.25rem; height: 1.25rem; }

/* Radio chips */
.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
.chip-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}
.chip-option:hover:not(:disabled) {
  border-color: var(--color-text-muted);
  color: var(--color-text-primary);
}
.chip-option input { position: absolute; opacity: 0; pointer-events: none; }
.chip-option--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.chip-option:disabled { opacity: 0.6; cursor: not-allowed; }

/* Stack picker */
.stack-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  margin-top: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  max-height: clamp(180px, 30vh, 260px);
  overflow-y: auto;
}
.stack-picker--invalid { border-color: var(--color-error); }

.stack-group__title {
  margin: 0 0 var(--space-2);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: var(--font-semibold);
  color: var(--color-text-muted);
}
.stack-group__chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.stack-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-2);
  min-height: 1.25rem;
}
.stack-counter {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}
.signup-note-inline { margin-top: 0; font-size: 0.75rem; }

/* Actions */
.signup-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.signup-actions--split {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
}
.btn.w-full { width: 100%; justify-content: center; }
.signup-actions--split .btn { justify-content: center; }

/* Legal */
.signup-legal {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.5;
  margin: 0;
}

/* Success — compacto, sem scroll */
.signup-success {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
}
.signup-success > .auth-form-title { margin: 0; }
.signup-success > .auth-form-subtitle { margin: 0; }

.signup-success__pulse {
  width: 64px;
  height: 64px;
  color: var(--color-accent);
  animation: success-pulse 2.4s ease-in-out infinite;
  flex-shrink: 0;
}
.signup-success__pulse svg { width: 100%; height: 100%; }
@keyframes success-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.06); opacity: 0.85; }
}

.signup-success__lead {
  max-width: 360px;
  margin: 0 auto;
}
.signup-success__lead strong { color: var(--color-text-primary); }

.signup-success__hint {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 0.8125rem;
  font-weight: var(--font-medium);
}
.signup-success__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 0 0 var(--color-accent);
  animation: signup-dot 1.6s ease-in-out infinite;
}
@keyframes signup-dot {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-accent); opacity: 1; }
  50%      { box-shadow: 0 0 0 6px transparent; opacity: 0.6; }
}

.signup-success__warn {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-warning);
  max-width: 360px;
}

.signup-success .signup-actions {
  width: 100%;
  margin-top: var(--space-1);
}

/* ==========================================================================
   Responsividade height-aware do signup
   ========================================================================== */

/* Heights compactas: encolher pulse e tightening signup-success */
@media (max-height: 700px) {
  .signup-progress { max-width: 200px; }
  .signup-success__pulse { width: 52px; height: 52px; }
  .signup-success { gap: var(--space-2); }
  .stack-picker { max-height: clamp(140px, 26vh, 220px); }
}

@media (max-height: 600px) {
  .signup-progress { max-width: 180px; }
  .signup-success__pulse { width: 44px; height: 44px; }
  .stack-picker { max-height: clamp(120px, 22vh, 180px); }
}

/* Wide screens — formulario respira mais */
@media (min-width: 1440px) and (min-height: 900px) {
  .signup-container { max-width: 500px; }
  .stack-picker { max-height: 320px; }
}

@media (min-width: 1920px) and (min-height: 1080px) {
  .signup-container { max-width: 540px; }
  .stack-picker { max-height: 360px; }
}
</style>
