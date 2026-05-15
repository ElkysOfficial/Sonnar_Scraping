<template>
  <div class="auth-page">
    <!-- Left Panel - Decorative (Desktop only) -->
    <div class="auth-panel-left">
      <div class="auth-panel-content">
        <router-link to="/" class="auth-panel-logo animate-fade-in-down" aria-label="Voltar para a home">
          <div class="auth-logo-mark">S</div>
          <span class="auth-logo-text">Sonnar</span>
        </router-link>

        <div class="auth-panel-tagline animate-fade-in-up stagger-2">
          <h2>Recupere o acesso</h2>
          <h2>em poucos passos.</h2>
        </div>

        <p class="auth-panel-description animate-fade-in stagger-3">
          Vamos enviar um código de verificação para o seu e-mail.
          Com ele, você cria uma nova senha e volta para o dashboard.
        </p>
      </div>
    </div>

    <!-- Right Panel - Form -->
    <div class="auth-panel-right">
      <div class="auth-form-container fp-container">
        <!-- Mobile Header -->
        <div class="auth-mobile-header animate-fade-in-down">
          <router-link to="/" class="auth-logo-link">
            <div class="auth-logo-mark-sm">S</div>
            <span class="auth-logo-text-sm">Sonnar</span>
          </router-link>
        </div>

        <div class="auth-form-header animate-fade-in-up stagger-1">
          <h1 class="auth-form-title">{{ stepTitle }}</h1>
          <p class="auth-form-subtitle">{{ stepSubtitle }}</p>
        </div>

        <!-- Stepper -->
        <ol class="fp-stepper" aria-label="Etapas da redefinição">
          <li
            v-for="(label, i) in stepLabels"
            :key="label"
            class="fp-step"
            :class="{
              'is-active': stepIndex === i,
              'is-done': stepIndex > i,
            }"
          >
            <span class="fp-step-bullet" aria-hidden="true">
              <svg v-if="stepIndex > i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="5 12 10 17 19 8" />
              </svg>
              <span v-else>{{ i + 1 }}</span>
            </span>
            <span class="fp-step-label">{{ label }}</span>
          </li>
        </ol>

        <!-- Mensagens -->
        <transition name="fp-fade">
          <div v-if="errorMessage" class="auth-alert auth-alert-error fp-alert" role="alert">
            <svg class="auth-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{{ errorMessage }}</span>
          </div>
        </transition>
        <transition name="fp-fade">
          <div v-if="successMessage" class="auth-alert auth-alert-success fp-alert" role="status">
            <svg class="auth-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{{ successMessage }}</span>
          </div>
        </transition>

        <transition name="fp-step-swap" mode="out-in">
          <!-- ETAPA 1: e-mail -->
          <form v-if="step === 'email'" key="email" @submit.prevent="handleSendEmail" class="auth-form">
            <div class="form-group">
              <label for="email" class="form-label">E-mail cadastrado</label>
              <div class="auth-input-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="auth-input-icon">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <input
                  id="email"
                  v-model="email"
                  type="email"
                  class="form-input auth-input-with-icon"
                  placeholder="seu@email.com"
                  required
                  autocomplete="email"
                  :disabled="isLoading"
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-lg w-full"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
            >
              <span v-if="!isLoading">Enviar código</span>
              <span v-else>Enviando…</span>
            </button>
          </form>

          <!-- ETAPA 2: token -->
          <form v-else-if="step === 'token'" key="token" @submit.prevent="handleVerifyToken" class="auth-form">
            <!-- Card do e-mail enviado -->
            <div class="fp-email-card">
              <div class="fp-email-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                  <polyline points="22 8 12 14 2 8" />
                </svg>
              </div>
              <div class="fp-email-card-body">
                <span class="fp-email-card-label">Código enviado para</span>
                <strong class="fp-email-card-value" :title="email">{{ email }}</strong>
              </div>
              <button
                type="button"
                class="fp-email-card-edit"
                :disabled="isLoading"
                @click="goBackToEmail"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Alterar</span>
              </button>
            </div>

            <!-- OTP -->
            <div class="form-group">
              <label class="form-label">Código de verificação</label>
              <div class="fp-otp" @paste="handleOtpPaste">
                <input
                  v-for="(_, i) in 6"
                  :key="i"
                  :ref="el => (otpRefs[i] = el as HTMLInputElement | null)"
                  v-model="otpDigits[i]"
                  type="text"
                  inputmode="numeric"
                  maxlength="1"
                  :autocomplete="i === 0 ? 'one-time-code' : 'off'"
                  class="fp-otp-input"
                  :class="{ 'is-filled': !!otpDigits[i] }"
                  :disabled="isLoading"
                  :aria-label="`Dígito ${i + 1} do código`"
                  @input="handleOtpInput($event, i)"
                  @keydown="handleOtpKeydown($event, i)"
                  @focus="($event.target as HTMLInputElement).select()"
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-lg w-full"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading || token.length < 6"
            >
              <span v-if="!isLoading">Verificar código</span>
              <span v-else>Verificando…</span>
            </button>

            <div class="fp-resend">
              <span class="fp-resend-text">Não recebeu o código?</span>
              <button
                type="button"
                class="auth-link-btn"
                :disabled="isLoading || resendCooldown > 0"
                @click="handleResend"
              >
                <span v-if="resendCooldown > 0">Reenviar em {{ resendCooldown }}s</span>
                <span v-else>Reenviar</span>
              </button>
            </div>
          </form>

          <!-- ETAPA 3: nova senha -->
          <form v-else-if="step === 'password'" key="password" @submit.prevent="handleUpdatePassword" class="auth-form">
            <div class="form-group">
              <label for="newPassword" class="form-label">Nova senha</label>
              <div class="auth-input-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="auth-input-icon">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <input
                  id="newPassword"
                  v-model="newPassword"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-input auth-input-with-icon"
                  placeholder="Crie uma senha forte"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  :disabled="isLoading"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="auth-password-toggle"
                  :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                >
                  <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>

              <!-- Barra de força -->
              <div v-if="newPassword.length > 0" class="fp-strength">
                <div class="fp-strength-bar">
                  <div
                    class="fp-strength-fill"
                    :class="strengthClass"
                    :style="{ width: strengthPercentage + '%' }"
                  ></div>
                </div>
                <div class="fp-strength-info">
                  <span class="fp-strength-label" :class="strengthClass">{{ strengthLabel }}</span>
                  <span class="fp-strength-score">{{ strengthScore }}/5</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label for="confirmPassword" class="form-label">Confirmar nova senha</label>
              <div class="auth-input-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="auth-input-icon">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <input
                  id="confirmPassword"
                  v-model="confirmPassword"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-input auth-input-with-icon"
                  placeholder="Repita a senha"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  :disabled="isLoading"
                />
              </div>
              <p v-if="passwordMismatch" class="form-error-message">
                As senhas não coincidem.
              </p>
            </div>

            <!-- Requisitos da senha -->
            <ul class="fp-requirements" aria-label="Requisitos da senha">
              <li :class="{ valid: passwordValidation.rules.minLength }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordValidation.rules.minLength" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Mínimo 8 caracteres
              </li>
              <li :class="{ valid: passwordValidation.rules.hasUppercase }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordValidation.rules.hasUppercase" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Letra maiúscula
              </li>
              <li :class="{ valid: passwordValidation.rules.hasLowercase }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordValidation.rules.hasLowercase" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Letra minúscula
              </li>
              <li :class="{ valid: passwordValidation.rules.hasNumber }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordValidation.rules.hasNumber" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Número
              </li>
              <li :class="{ valid: passwordValidation.rules.hasSpecial }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordValidation.rules.hasSpecial" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Caractere especial
              </li>
              <li :class="{ valid: passwordsMatch }">
                <span class="fp-req-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path v-if="passwordsMatch" fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    <circle v-else cx="10" cy="10" r="3" />
                  </svg>
                </span>
                Senhas coincidem
              </li>
            </ul>

            <button
              type="submit"
              class="btn btn-primary btn-lg w-full"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading || !isPasswordFormValid"
            >
              <span v-if="!isLoading">Confirmar nova senha</span>
              <span v-else>Salvando…</span>
            </button>
          </form>
        </transition>

        <p class="auth-help-text animate-fade-in stagger-3">
          Lembrou da senha?
          <router-link to="/login" class="auth-help-link">Voltar para o login</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { validatePassword } from '@/utils/validators'

const router = useRouter()
const { sendPasswordReset, verifyPasswordResetToken, updatePassword, signOut } = useAuth()

type Step = 'email' | 'token' | 'password'
const step = ref<Step>('email')

const email = ref('')
const otpDigits = ref<string[]>(['', '', '', '', '', ''])
const otpRefs = ref<(HTMLInputElement | null)[]>([])
const token = computed(() => otpDigits.value.join(''))

const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)

const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const resendCooldown = ref(0)
let resendTimer: number | null = null

const stepLabels = ['E-mail', 'Código', 'Nova senha']
const stepIndex = computed(() => (step.value === 'email' ? 0 : step.value === 'token' ? 1 : 2))

const stepTitle = computed(() => {
  if (step.value === 'email') return 'Esqueceu sua senha?'
  if (step.value === 'token') return 'Digite o código'
  return 'Crie uma nova senha'
})

const stepSubtitle = computed(() => {
  if (step.value === 'email') return 'Informe seu e-mail e enviaremos um código de verificação.'
  if (step.value === 'token') return 'Confira sua caixa de entrada e digite o código de 6 dígitos abaixo.'
  return 'Escolha uma senha forte para proteger sua conta.'
})

const passwordMismatch = computed(
  () => confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value
)

const passwordValidation = computed(() => validatePassword(newPassword.value))
const passwordsMatch = computed(
  () => newPassword.value.length > 0 && newPassword.value === confirmPassword.value
)

const strengthScore = computed(() => {
  const rules = passwordValidation.value.rules
  return Object.values(rules).filter(Boolean).length
})
const strengthPercentage = computed(() => (strengthScore.value / 5) * 100)
const strengthClass = computed(() => {
  const s = strengthScore.value
  if (s <= 1) return 'strength-weak'
  if (s <= 2) return 'strength-fair'
  if (s <= 3) return 'strength-good'
  if (s <= 4) return 'strength-strong'
  return 'strength-excellent'
})
const strengthLabel = computed(() => {
  const s = strengthScore.value
  if (s <= 1) return 'Muito fraca'
  if (s <= 2) return 'Fraca'
  if (s <= 3) return 'Razoável'
  if (s <= 4) return 'Forte'
  return 'Excelente'
})

const isPasswordFormValid = computed(
  () => passwordValidation.value.isValid && passwordsMatch.value
)

function startResendCooldown() {
  resendCooldown.value = 60
  if (resendTimer) window.clearInterval(resendTimer)
  resendTimer = window.setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && resendTimer) {
      window.clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (resendTimer) window.clearInterval(resendTimer)
})

// Foca primeiro input do OTP ao entrar na etapa do código
watch(step, async (s) => {
  if (s === 'token') {
    await nextTick()
    otpRefs.value[0]?.focus()
  }
})

function resetOtp() {
  otpDigits.value = ['', '', '', '', '', '']
}

function goBackToEmail() {
  errorMessage.value = ''
  successMessage.value = ''
  resetOtp()
  step.value = 'email'
}

function handleOtpInput(event: Event, index: number) {
  const input = event.target as HTMLInputElement
  // Permite só dígito
  const cleaned = input.value.replace(/\D/g, '')
  otpDigits.value[index] = cleaned.slice(-1) ?? ''
  input.value = otpDigits.value[index]

  if (otpDigits.value[index] && index < 5) {
    otpRefs.value[index + 1]?.focus()
  }
}

function handleOtpKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'Backspace' && !otpDigits.value[index] && index > 0) {
    otpRefs.value[index - 1]?.focus()
  } else if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    otpRefs.value[index - 1]?.focus()
  } else if (event.key === 'ArrowRight' && index < 5) {
    event.preventDefault()
    otpRefs.value[index + 1]?.focus()
  }
}

function handleOtpPaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text') ?? ''
  const digits = text.replace(/\D/g, '').slice(0, 6).split('')
  if (digits.length === 0) return
  const next = ['', '', '', '', '', '']
  digits.forEach((d, i) => (next[i] = d))
  otpDigits.value = next
  const focusIndex = Math.min(digits.length, 5)
  nextTick(() => otpRefs.value[focusIndex]?.focus())
}

async function handleSendEmail() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = 'Informe um e-mail válido.'
    return
  }

  isLoading.value = true
  const result = await sendPasswordReset(email.value)
  isLoading.value = false

  if (result.success) {
    successMessage.value = 'Código enviado. Verifique seu e-mail.'
    resetOtp()
    step.value = 'token'
    startResendCooldown()
  } else {
    errorMessage.value = result.error
  }
}

async function handleResend() {
  if (resendCooldown.value > 0) return
  errorMessage.value = ''
  successMessage.value = ''

  isLoading.value = true
  const result = await sendPasswordReset(email.value)
  isLoading.value = false

  if (result.success) {
    successMessage.value = 'Novo código enviado.'
    resetOtp()
    await nextTick()
    otpRefs.value[0]?.focus()
    startResendCooldown()
  } else {
    errorMessage.value = result.error
  }
}

async function handleVerifyToken() {
  errorMessage.value = ''
  successMessage.value = ''

  isLoading.value = true
  const result = await verifyPasswordResetToken(email.value, token.value)
  isLoading.value = false

  if (result.success) {
    step.value = 'password'
  } else {
    errorMessage.value = result.error
  }
}

async function handleUpdatePassword() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!passwordValidation.value.isValid) {
    errorMessage.value = 'A senha não atende a todos os requisitos.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'As senhas não coincidem.'
    return
  }

  isLoading.value = true
  const result = await updatePassword(newPassword.value)

  if (!result.success) {
    isLoading.value = false
    errorMessage.value = result.error
    return
  }

  await signOut()
  isLoading.value = false

  router.replace({
    path: '/login',
    query: { reset: 'success' }
  })
}
</script>

<style scoped>
@import '@/assets/auth-pages.css';

.fp-container {
  display: flex;
  flex-direction: column;
}

.form-input {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

/* ==========================================================================
   Stepper com conectores
   ========================================================================== */
.fp-stepper {
  list-style: none;
  margin: var(--space-2) 0 var(--space-5);
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  position: relative;
}

.fp-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
}

/* linha conectora entre as bolinhas */
.fp-step + .fp-step::before {
  content: '';
  position: absolute;
  top: 14px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: var(--color-border);
  z-index: -1;
  transition: background var(--transition-fast);
}
.fp-step.is-active + .fp-step::before,
.fp-step.is-done + .fp-step::before {
  background: var(--color-accent);
}

.fp-step-bullet {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  color: var(--color-text-muted);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: var(--font-bold);
  transition: all var(--transition-fast);
}
.fp-step-bullet svg {
  width: 14px;
  height: 14px;
}
.fp-step.is-active .fp-step-bullet {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 18%, transparent);
}
.fp-step.is-done .fp-step-bullet {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.fp-step-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  transition: color var(--transition-fast);
}
.fp-step.is-active .fp-step-label,
.fp-step.is-done .fp-step-label {
  color: var(--color-text-primary);
}

/* ==========================================================================
   Card do e-mail (etapa 2)
   ========================================================================== */
.fp-email-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-1);
}

.fp-email-card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  display: grid;
  place-items: center;
}
.fp-email-card-icon svg { width: 18px; height: 18px; }

.fp-email-card-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.fp-email-card-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.fp-email-card-value {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-email-card-edit {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 6px 10px;
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.fp-email-card-edit svg { width: 12px; height: 12px; }
.fp-email-card-edit:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}
.fp-email-card-edit:disabled { opacity: 0.5; cursor: not-allowed; }

/* ==========================================================================
   OTP - 6 caixas
   ========================================================================== */
.fp-otp {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-2);
}

.fp-otp-input {
  width: 100%;
  aspect-ratio: 1 / 1.15;
  max-height: 56px;
  text-align: center;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
  caret-color: var(--color-accent);
  padding: 0;
}
.fp-otp-input.is-filled {
  border-color: color-mix(in srgb, var(--color-accent) 50%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent) 5%, var(--color-surface));
}
.fp-otp-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
.fp-otp-input:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 375px) {
  .fp-otp { gap: 6px; }
  .fp-otp-input { font-size: var(--text-xl); }
}

/* ==========================================================================
   Reenvio
   ========================================================================== */
.fp-resend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: var(--space-1);
}
.fp-resend-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.auth-link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: color var(--transition-fast);
}
.auth-link-btn:hover:not(:disabled) {
  color: var(--color-accent-hover);
  text-decoration: underline;
}
.auth-link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ==========================================================================
   Mensagens
   ========================================================================== */
.fp-alert {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
}

.form-error-message {
  margin: var(--space-2) 0 0 0;
  font-size: var(--text-xs);
  color: var(--color-error);
}

/* ==========================================================================
   Força e requisitos da senha
   ========================================================================== */
.fp-strength {
  margin-top: var(--space-2);
}
.fp-strength-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.fp-strength-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-slow), background var(--transition-slow);
}
.fp-strength-fill.strength-weak { background: var(--color-error); }
.fp-strength-fill.strength-fair { background: var(--color-warning); }
.fp-strength-fill.strength-good { background: var(--color-accent); }
.fp-strength-fill.strength-strong { background: var(--color-success, #059669); }
.fp-strength-fill.strength-excellent {
  background: linear-gradient(90deg, var(--color-accent), var(--color-success, #059669));
}
.fp-strength-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.fp-strength-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}
.fp-strength-label.strength-weak { color: var(--color-error); }
.fp-strength-label.strength-fair { color: var(--color-warning); }
.fp-strength-label.strength-good { color: var(--color-accent); }
.fp-strength-label.strength-strong { color: var(--color-success, #059669); }
.fp-strength-label.strength-excellent { color: var(--color-success, #059669); }
.fp-strength-score {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.fp-requirements {
  list-style: none;
  margin: 0;
  padding: var(--space-3);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
@media (max-width: 480px) {
  .fp-requirements { grid-template-columns: 1fr; }
}
.fp-requirements li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}
.fp-req-icon {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}
.fp-req-icon svg { width: 14px; height: 14px; }
.fp-requirements li.valid,
.fp-requirements li.valid .fp-req-icon {
  color: var(--color-success, #059669);
}

/* ==========================================================================
   Transições entre etapas
   ========================================================================== */
.fp-step-swap-enter-active,
.fp-step-swap-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.fp-step-swap-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.fp-step-swap-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.fp-fade-enter-active,
.fp-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.fp-fade-enter-from,
.fp-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
