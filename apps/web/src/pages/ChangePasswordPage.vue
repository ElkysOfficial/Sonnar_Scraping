<template>
  <div class="change-password-page">
    <!-- Left Panel - Decorative (Desktop only) -->
    <div class="auth-panel-left">
      <div class="panel-content">
        <div class="panel-logo animate-fade-in-down">
          <div class="logo-mark">S</div>
          <span class="logo-text">Sonnar</span>
        </div>
        
        <div class="panel-icon animate-scale-in stagger-2 animate-pulse-soft">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        
        <div class="panel-tagline animate-fade-in-up stagger-3">
          <h2>Segurança em</h2>
          <h2>primeiro lugar.</h2>
        </div>
        
        <p class="panel-description animate-fade-in stagger-4">
          Crie uma senha forte para proteger sua conta e 
          garantir a segurança dos seus dados.
        </p>
      </div>
    </div>

    <!-- Right Panel - Form -->
    <div class="auth-panel-right">
      <div class="form-container">
        <!-- Mobile Header -->
        <div class="mobile-header animate-fade-in-down">
          <div class="logo-link">
            <div class="logo-mark-sm">S</div>
            <span class="logo-text-sm">Sonnar</span>
          </div>
        </div>

        <div class="form-header animate-fade-in-up stagger-1">
          <h1 class="form-title">Altere sua senha</h1>
          <p class="form-subtitle">
            Para sua segurança, você precisa criar uma nova senha antes de continuar.
          </p>
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="error-alert">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Success message -->
        <div v-if="successMessage" class="success-alert">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span>{{ successMessage }}</span>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleSubmit" class="password-form animate-fade-in-up stagger-2">
          <div class="form-group">
            <label for="newPassword" class="form-label">Nova senha</label>
            <div class="input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="input-icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <input
                id="newPassword"
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                class="form-input with-icon"
                placeholder="Mínimo 8 caracteres"
                required
                minlength="8"
                :disabled="isLoading"
              />
              <button 
                type="button" 
                @click="showNewPassword = !showNewPassword"
                class="password-toggle"
                :aria-label="showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'"
              >
                <svg v-if="showNewPassword" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            <!-- Password Strength Bar -->
            <div v-if="newPassword.length > 0" class="strength-container">
              <div class="strength-bar">
                <div 
                  class="strength-fill" 
                  :style="{ width: strengthPercentage + '%' }"
                  :class="strengthClass"
                ></div>
              </div>
              <div class="strength-info">
                <span class="strength-label" :class="strengthClass">{{ strengthLabel }}</span>
                <span class="strength-score">{{ strengthScore }}/5</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="confirmPassword" class="form-label">Confirme a nova senha</label>
            <div class="input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="input-icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="form-input with-icon"
                placeholder="Repita a senha"
                required
                minlength="8"
                :disabled="isLoading"
              />
              <button 
                type="button" 
                @click="showConfirmPassword = !showConfirmPassword"
                class="password-toggle"
                :aria-label="showConfirmPassword ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'"
              >
                <svg v-if="showConfirmPassword" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

        <!-- Password requirements -->
        <div class="password-requirements">
          <div class="requirement" :class="{ valid: passwordValidation.rules.minLength }">
            <svg v-if="passwordValidation.rules.minLength" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Mínimo 8 caracteres</span>
          </div>
          <div class="requirement" :class="{ valid: passwordValidation.rules.hasUppercase }">
            <svg v-if="passwordValidation.rules.hasUppercase" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Letra maiúscula</span>
          </div>
          <div class="requirement" :class="{ valid: passwordValidation.rules.hasLowercase }">
            <svg v-if="passwordValidation.rules.hasLowercase" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Letra minúscula</span>
          </div>
          <div class="requirement" :class="{ valid: passwordValidation.rules.hasNumber }">
            <svg v-if="passwordValidation.rules.hasNumber" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Número</span>
          </div>
          <div class="requirement" :class="{ valid: passwordValidation.rules.hasSpecial }">
            <svg v-if="passwordValidation.rules.hasSpecial" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Caractere especial</span>
          </div>
          <div class="requirement" :class="{ valid: passwordsMatch }">
            <svg v-if="passwordsMatch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <span>Senhas coincidem</span>
          </div>
        </div>

        <button 
          type="submit" 
          class="btn-submit"
          :disabled="isLoading || !isFormValid"
        >
          <span v-if="isLoading" class="loading-spinner"></span>
          <span v-else>Alterar senha</span>
        </button>
      </form>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { validatePassword } from '@/utils/validators'

const router = useRouter()
const { changePassword, userRole } = useAuth()

const newPassword = ref('')
const confirmPassword = ref('')
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const passwordValidation = computed(() => validatePassword(newPassword.value))

const passwordsMatch = computed(() => 
  newPassword.value.length > 0 && newPassword.value === confirmPassword.value
)

// Password strength calculation
const strengthScore = computed(() => {
  const rules = passwordValidation.value.rules
  return Object.values(rules).filter(Boolean).length
})

const strengthPercentage = computed(() => {
  return (strengthScore.value / 5) * 100
})

const strengthClass = computed(() => {
  const score = strengthScore.value
  if (score <= 1) return 'strength-weak'
  if (score <= 2) return 'strength-fair'
  if (score <= 3) return 'strength-good'
  if (score <= 4) return 'strength-strong'
  return 'strength-excellent'
})

const strengthLabel = computed(() => {
  const score = strengthScore.value
  if (score <= 1) return 'Muito fraca'
  if (score <= 2) return 'Fraca'
  if (score <= 3) return 'Razoável'
  if (score <= 4) return 'Forte'
  return 'Excelente'
})

const isFormValid = computed(() => 
  passwordValidation.value.isValid && passwordsMatch.value
)

async function handleSubmit() {
  if (!isFormValid.value) return

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const result = await changePassword(newPassword.value)
    
    if (result.success) {
      successMessage.value = 'Senha alterada com sucesso! Redirecionando...'
      
      setTimeout(() => {
        if (userRole.value === 'owner' || userRole.value === 'admin') {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      }, 1500)
    } else {
      errorMessage.value = result.error || 'Erro ao alterar senha'
    }
  } catch {
    errorMessage.value = 'Ocorreu um erro inesperado. Tente novamente.'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
@import '@/assets/auth-pages.css';

/* Page wrapper - uses shared auth-page layout */
.change-password-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 1fr;
  background: var(--color-surface);
}

@media (min-width: 1024px) {
  .change-password-page {
    grid-template-columns: 1fr 1fr;
  }
}

/* Panel content - page specific */
.panel-content {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: var(--space-8);
  color: white;
}

.panel-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}

.logo-mark {
  width: 3rem;
  height: 3rem;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
}

.logo-text {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
}

.panel-icon {
  width: 120px;
  height: 120px;
  margin: 0 auto var(--space-8);
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.panel-icon svg {
  width: 60px;
  height: 60px;
}

.panel-tagline h2 {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: var(--font-bold);
  line-height: 1.2;
  margin: 0;
}

.panel-description {
  margin-top: var(--space-4);
  font-size: var(--text-base);
  opacity: 0.9;
  max-width: 320px;
  margin-inline: auto;
  line-height: var(--lh-body);
}

/* Form container - page specific */
.form-container {
  width: 100%;
  max-width: 400px;
}

.mobile-header {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-8);
}

@media (min-width: 1024px) {
  .mobile-header {
    display: none;
  }
}

.logo-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.logo-mark-sm {
  width: 2.5rem;
  height: 2.5rem;
  background: var(--color-accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
}

.logo-text-sm {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.form-header {
  text-align: center;
  margin-bottom: var(--space-6);
}

.form-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}

.form-subtitle {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

/* Alerts - using Design System colors */
.error-alert,
.success-alert {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  margin-bottom: var(--space-6);
}

.error-alert {
  background: var(--color-error-soft);
  border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
  color: var(--color-error);
}

.success-alert {
  background: var(--color-success-soft);
  border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
  color: var(--color-success);
}

.alert-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

/* Form elements */
.password-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
}

.input-wrapper {
  position: relative;
}

.input-icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-text-muted);
  pointer-events: none;
}

.form-input.with-icon {
  padding-left: 3rem;
  padding-right: 3rem;
}

.form-input {
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  background: var(--color-surface);
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.form-input::placeholder {
  color: var(--color-text-muted);
}

.password-toggle {
  position: absolute;
  right: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: var(--space-1);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.password-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
}

.password-toggle:hover {
  color: var(--color-text-primary);
}

/* Password requirements - using shared auth classes */
.password-requirements {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2) var(--space-4);
}

@media (max-width: 480px) {
  .password-requirements {
    grid-template-columns: 1fr;
  }
}

.requirement {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}

.requirement svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.requirement.valid {
  color: var(--color-success);
}

/* Password Strength Bar - using Design System semantic colors */
.strength-container {
  margin-top: var(--space-3);
}

.strength-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-slow), background var(--transition-slow);
}

.strength-fill.strength-weak {
  background: var(--color-error);
}

.strength-fill.strength-fair {
  background: var(--color-warning);
}

.strength-fill.strength-good {
  background: var(--color-accent); /* Yellow - between warning and success */
}

.strength-fill.strength-strong {
  background: var(--color-success);
}

.strength-fill.strength-excellent {
  background: linear-gradient(90deg, var(--color-success), var(--color-secondary));
}

.strength-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-2);
}

.strength-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  transition: color var(--transition-slow);
}

.strength-label.strength-weak { color: var(--color-error); }
.strength-label.strength-fair { color: var(--color-warning); }
.strength-label.strength-good { color: var(--color-accent); }
.strength-label.strength-strong { color: var(--color-success); }
.strength-label.strength-excellent { color: var(--color-secondary); }

.strength-score {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* Submit button - using Design System button styles */
.btn-submit {
  width: 100%;
  padding: var(--space-4);
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.btn-submit:hover:not(:disabled) {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
