<template>
  <section
    id="contato"
    class="section"
  >
    <div class="container">
      <div class="contact-wrapper">
        <div class="contact-info">
          <h2 class="contact-title">
            Comece a receber vagas
          </h2>
          <p class="contact-description">
            Preencha seus dados e configure seu perfil.
            Você começa a receber vagas em minutos.
          </p>

          <div class="contact-features">
            <div class="contact-feature">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10L8 14L16 6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Configuração em 2 minutos</span>
            </div>
            <div class="contact-feature">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10L8 14L16 6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Teste grátis por 7 dias</span>
            </div>
            <div class="contact-feature">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10L8 14L16 6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Cancele quando quiser</span>
            </div>
          </div>

          <div
            v-if="whatsappUrl"
            class="contact-alternative"
          >
            <p>Prefere falar diretamente?</p>
            <a
              :href="whatsappUrl"
              class="btn btn-whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 1C4.58 1 1 4.58 1 9C1 10.85 1.63 12.55 2.69 13.91L1.5 17L4.72 15.85C6.01 16.64 7.46 17 9 17C13.42 17 17 13.42 17 9C17 4.58 13.42 1 9 1Z"
                  fill="currentColor"
                />
              </svg>
              Falar no WhatsApp
            </a>
          </div>
        </div>

        <form
          class="contact-form"
          @submit.prevent="handleSubmit"
        >
          <div class="form-row form-row-2">
            <div class="form-group">
              <label
                for="name"
                class="form-label"
              >Nome</label>
              <input
                id="name"
                v-model="form.name"
                type="text"
                class="form-input"
                placeholder="Seu nome"
                required
              >
            </div>
            <div class="form-group">
              <label
                for="whatsapp"
                class="form-label"
              >WhatsApp</label>
              <input
                id="whatsapp"
                v-model="form.whatsapp"
                type="tel"
                class="form-input"
                placeholder="(11) 99999-9999"
                required
              >
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label
                for="email"
                class="form-label"
              >E-mail</label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                class="form-input"
                placeholder="seu@email.com"
                required
              >
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label
                for="stack"
                class="form-label"
              >Stack principal</label>
              <select
                id="stack"
                v-model="form.stack"
                class="form-select"
                required
              >
                <option
                  value=""
                  disabled
                >
                  Selecione
                </option>
                <option value="frontend">
                  Frontend
                </option>
                <option value="backend">
                  Backend
                </option>
                <option value="fullstack">
                  Full Stack
                </option>
                <option value="mobile">
                  Mobile
                </option>
                <option value="devops">
                  DevOps / SRE
                </option>
                <option value="data">
                  Data / Analytics
                </option>
                <option value="other">
                  Outro
                </option>
              </select>
            </div>
            <div class="form-group">
              <label
                for="seniority"
                class="form-label"
              >Senioridade</label>
              <select
                id="seniority"
                v-model="form.seniority"
                class="form-select"
                required
              >
                <option
                  value=""
                  disabled
                >
                  Selecione
                </option>
                <option value="junior">
                  Júnior
                </option>
                <option value="pleno">
                  Pleno
                </option>
                <option value="senior">
                  Sênior
                </option>
                <option value="staff_lead">
                  Lead / Staff
                </option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-lg form-submit"
            :disabled="isSubmitting"
          >
            <span v-if="!isSubmitting">Começar a receber vagas</span>
            <span v-else>Enviando...</span>
          </button>

          <p
            v-if="successMessage"
            class="form-feedback form-feedback-success"
            role="status"
          >
            {{ successMessage }}
          </p>
          <p
            v-if="errorMessage"
            class="form-feedback form-feedback-error"
            role="alert"
          >
            {{ errorMessage }}
          </p>

          <p class="form-privacy">
            Ao enviar, você concorda com nossa
            <a href="#">Política de Privacidade</a>.
          </p>
        </form>
      </div>
    </div>
  </section>
</template>

<script>
import { supabase } from '@/integrations/supabase/client'

const emptyForm = () => ({
  name: '',
  email: '',
  whatsapp: '',
  stack: '',
  seniority: ''
})

export default {
  name: 'ContactSection',
  data() {
    return {
      isSubmitting: false,
      successMessage: '',
      errorMessage: '',
      form: emptyForm()
    }
  },
  computed: {
    whatsappUrl() {
      const phone = import.meta.env.VITE_WHATSAPP_PHONE
      if (!phone) return ''
      const text = encodeURIComponent('Olá! Gostaria de saber mais sobre o Sonnar.')
      return `https://wa.me/${phone}?text=${text}`
    }
  },
  methods: {
    async handleSubmit() {
      this.isSubmitting = true
      this.successMessage = ''
      this.errorMessage = ''

      const { error } = await supabase.from('contact_leads').insert({
        name: this.form.name.trim(),
        email: this.form.email.trim().toLowerCase(),
        whatsapp: this.form.whatsapp.trim(),
        stack: this.form.stack,
        seniority: this.form.seniority
      })

      if (error) {
        console.error('Erro ao salvar lead:', error)
        this.errorMessage = 'Não foi possível enviar agora. Tente novamente em instantes.'
        this.isSubmitting = false
        return
      }

      this.successMessage = 'Cadastro recebido! Em breve entraremos em contato pelo WhatsApp.'
      this.form = emptyForm()
      this.isSubmitting = false
    }
  }
}
</script>

<style scoped>
/* ==========================================================================
   Contact Wrapper - Mobile-First Grid
   ========================================================================== */

.contact-wrapper {
  display: grid;
  /* Mobile: single column */
  grid-template-columns: 1fr;
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}

/* Desktop: two columns */
@media (min-width: 768px) {
  .contact-wrapper {
    grid-template-columns: 1fr 1fr;
  }
}

/* ==========================================================================
   Contact Info
   ========================================================================== */

.contact-title {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-3);
  letter-spacing: var(--ls-tight);
  line-height: var(--lh-title);
}

.contact-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
  margin-bottom: var(--space-8);
}

/* ==========================================================================
   Contact Features
   ========================================================================== */

.contact-features {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}

.contact-feature {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--lh-body);
}

.contact-feature svg {
  color: var(--color-success);
  flex-shrink: 0;
}

/* ==========================================================================
   Contact Alternative (WhatsApp)
   ========================================================================== */

.contact-alternative {
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.contact-alternative p {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-3);
}

/* ==========================================================================
   Contact Form
   ========================================================================== */

.contact-form {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
}

.form-row {
  margin-bottom: var(--space-4);
}

.form-row:last-of-type {
  margin-bottom: var(--space-5);
}

/* Two-column form row */
.form-row-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--grid-gap-sm);
}

/* ==========================================================================
   Form Submit Button
   ========================================================================== */

.form-submit {
  width: 100%;
  margin-top: var(--space-2);
}

.form-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* ==========================================================================
   Form Privacy
   ========================================================================== */

.form-privacy {
  margin-top: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-align: center;
  line-height: var(--lh-body);
}

.form-privacy a {
  color: var(--color-accent);
  text-decoration: underline;
  transition: color var(--transition-fast);
}

.form-privacy a:hover {
  color: var(--color-accent-hover);
}

/* ==========================================================================
   Form Feedback (success / error)
   ========================================================================== */

.form-feedback {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
  text-align: center;
}

.form-feedback-success {
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 35%, transparent);
}

.form-feedback-error {
  background: color-mix(in srgb, var(--color-danger, #dc2626) 10%, transparent);
  color: var(--color-danger, #dc2626);
  border: 1px solid color-mix(in srgb, var(--color-danger, #dc2626) 35%, transparent);
}
</style>
