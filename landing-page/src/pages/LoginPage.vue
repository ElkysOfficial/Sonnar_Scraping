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
          <h2>Vagas do seu stack,</h2>
          <h2>direto no WhatsApp.</h2>
        </div>

        <p class="auth-panel-description animate-fade-in stagger-3">
          Receba oportunidades personalizadas baseadas nas suas preferências,
          sem precisar ficar buscando.
        </p>

        <div class="auth-panel-mockup animate-scale-in stagger-4">
          <WhatsAppPhoneMockup size="compact" :tilt="false" />
        </div>
      </div>
    </div>

    <!-- Right Panel - Form -->
    <div class="auth-panel-right">
      <div class="auth-form-container">
        <!-- Mobile Header -->
        <div class="auth-mobile-header animate-fade-in-down">
          <router-link to="/" class="auth-logo-link">
            <div class="auth-logo-mark-sm">S</div>
            <span class="auth-logo-text-sm">Sonnar</span>
          </router-link>
        </div>

        <div class="auth-form-header animate-fade-in-up stagger-1">
          <h1 class="auth-form-title">Bem-vindo de volta</h1>
          <p class="auth-form-subtitle">Entre na sua conta para acessar o dashboard</p>
        </div>

        <!-- Mensagens -->
        <div v-if="errorMessage" class="auth-alert auth-alert-error" role="alert">
          <span>{{ errorMessage }}</span>
        </div>
        <div v-if="successMessage" class="auth-alert auth-alert-success" role="status">
          <span>{{ successMessage }}</span>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleEmailLogin()" class="auth-form animate-fade-in-up stagger-2">
          <div class="form-group">
            <label for="email" class="form-label">E-mail</label>
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
                :disabled="isLoading"
              />
            </div>
          </div>

          <div class="form-group">
            <div class="form-label-row">
              <label for="password" class="form-label">Senha</label>
              <button
                type="button"
                class="auth-link-btn"
                :disabled="isLoading"
                @click="handleForgotPassword"
              >
                Esqueci minha senha
              </button>
            </div>
            <div class="auth-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="auth-input-icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-input auth-input-with-icon"
                placeholder="Sua senha"
                required
                :disabled="isLoading"
                minlength="6"
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
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-lg w-full"
            :class="{ 'is-loading': isLoading }"
            :disabled="isLoading"
          >
            <span v-if="!isLoading">Entrar</span>
            <span v-else>Entrando…</span>
          </button>
        </form>

        <!-- Divisor -->
        <div class="auth-divider" aria-hidden="true">
          <span>ou</span>
        </div>

        <!-- Botão de cadastro -->
        <router-link
          to="/cadastro"
          class="btn btn-secondary btn-lg w-full"
        >
          Criar uma conta
        </router-link>

        <p class="auth-help-text animate-fade-in stagger-3">
          Não sabe qual plano escolher?
          <router-link to="/#planos" class="auth-help-link">Ver planos</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { safeRedirect } from '@/utils/safeRedirect'
import WhatsAppPhoneMockup from '@/components/WhatsAppPhoneMockup.vue'

const router = useRouter()
const route = useRoute()
const { signInWithEmail, sendPasswordReset, isAuthenticated, userRole } = useAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(() => {
  const urlError = route.query.error as string
  if (urlError === 'unauthorized') {
    errorMessage.value = 'Seu e-mail não está autorizado a acessar o sistema. Verifique se você possui uma assinatura ativa.'
  }

  // Fluxo pos-Stripe legado: sessões antigas ainda usam success_url=/login?from=stripe.
  if (route.query.from === 'stripe') {
    router.replace('/pagamento/confirmando')
    return
  }

  // Já autenticado caindo aqui (ex.: clicou em /login com sessão ativa) →
  // honra ?redirect= se houver, senão decide por papel. O guard global
  // já cobre o caso de publicOnly+autenticado, mas mantemos por defesa.
  if (isAuthenticated.value) {
    redirectAfterLogin()
  }
})

async function redirectAfterLogin() {
  const intended = safeRedirect(route.query.redirect)
  if (intended) {
    router.replace(intended)
    return
  }

  if (userRole.value === 'owner' || userRole.value === 'admin') {
    router.replace('/admin')
    return
  }

  // Cliente: checa pagamento usando o singleton (já hidratado pelo bootAuth/signIn).
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    const { data: sub } = await supabase
      .from('subscribers')
      .select('plan, status')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (sub && sub.plan !== 'free' && sub.status !== 'active') {
      router.replace('/pagar')
      return
    }
  }

  router.replace('/dashboard')
}

async function handleEmailLogin() {
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const result = await signInWithEmail(email.value, password.value)

    if (result.success) {
      redirectAfterLogin()
    } else {
      errorMessage.value = result.error
    }
  } catch {
    errorMessage.value = 'Ocorreu um erro inesperado. Tente novamente.'
  } finally {
    isLoading.value = false
  }
}

async function handleForgotPassword() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = 'Digite seu e-mail acima e clique novamente em "Esqueci minha senha".'
    return
  }

  isLoading.value = true
  const result = await sendPasswordReset(email.value)
  isLoading.value = false

  if (result.success) {
    successMessage.value = 'Se este e-mail estiver cadastrado, enviamos um link para redefinir sua senha.'
  } else {
    errorMessage.value = result.error
  }
}
</script>

<style scoped>
@import '@/assets/auth-pages.css';

/* Page-specific styles for phone mockup */
.auth-panel-hero {
  margin-bottom: var(--space-8);
}

.auth-hero-mockup {
  display: flex;
  justify-content: center;
}

.auth-mockup-icon {
  font-size: var(--text-base);
}

.auth-mockup-text {
  flex: 1;
  text-align: left;
}

.auth-mockup-message:nth-child(1) { animation-delay: 0.2s; }
.auth-mockup-message:nth-child(2) { animation-delay: 0.4s; }
.auth-mockup-message:nth-child(3) { animation-delay: 0.6s; }

.auth-mockup-message {
  animation: fadeInUp 0.6s ease-out;
  animation-fill-mode: both;
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

/* Override form-input for this page to use surface background */
.form-input {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

/* Linha label + link "Esqueci minha senha" */
.form-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
  gap: var(--space-3);
}
.form-label-row .form-label { margin-bottom: 0; }

.auth-link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--color-accent);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: color var(--transition-fast);
}
.auth-link-btn:hover:not(:disabled) {
  color: var(--color-accent-hover);
  text-decoration: underline;
}
.auth-link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Divisor "ou" entre os botões de Entrar e Cadastrar */
.auth-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-5) 0;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}
.auth-divider span { flex-shrink: 0; }

/* Botão "Criar uma conta" — herda btn-secondary mas garante full-width */
.btn.btn-secondary.w-full {
  width: 100%;
  justify-content: center;
}
</style>
