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

        <!-- ============ STEP 0 - Selecao de plano ============ -->
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

        <!-- ============ STEP 1 - Conta ============ -->
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

        <!-- ============ STEP 2 - Dados pessoais ============ -->
        <template v-else-if="step === 'personal'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Seus dados pessoais</h1>
            <p class="auth-form-subtitle">Para personalizar suas mensagens e recibos.</p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitPersonal">
            <!-- Tipo de cadastro: PF/PJ -->
            <div class="form-group">
              <span class="form-label">Tipo de cadastro</span>
              <div class="radio-group">
                <label
                  v-for="opt in personTypeOptions"
                  :key="opt.value"
                  class="chip-option"
                  :class="{ 'chip-option--active': form.personType === opt.value }"
                >
                  <input
                    v-model="form.personType"
                    type="radio"
                    name="personType"
                    :value="opt.value"
                    :disabled="loading"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>

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

            <!-- CPF (PF) -->
            <div v-if="form.personType === 'pf'" class="form-group">
              <label for="su-cpf" class="form-label">CPF</label>
              <input
                id="su-cpf"
                v-model="form.cpf"
                type="text"
                class="form-input"
                autocomplete="off"
                inputmode="numeric"
                placeholder="000.000.000-00"
                maxlength="14"
                required
                :disabled="loading"
                @input="onCpfInput"
              />
              <p v-if="errors.cpf" class="form-error">{{ errors.cpf }}</p>
            </div>

            <!-- CNPJ + Razao Social (PJ) -->
            <template v-else>
              <div class="form-group">
                <label for="su-cnpj" class="form-label">CNPJ</label>
                <input
                  id="su-cnpj"
                  v-model="form.cnpj"
                  type="text"
                  class="form-input"
                  autocomplete="off"
                  inputmode="numeric"
                  placeholder="00.000.000/0000-00"
                  maxlength="18"
                  required
                  :disabled="loading"
                  @input="onCnpjInput"
                />
                <p v-if="errors.cnpj" class="form-error">{{ errors.cnpj }}</p>
              </div>
              <div class="form-group">
                <label for="su-legal" class="form-label">Razão social</label>
                <input
                  id="su-legal"
                  v-model.trim="form.legalName"
                  type="text"
                  class="form-input"
                  autocomplete="organization"
                  placeholder="Empresa Exemplo LTDA"
                  required
                  :disabled="loading"
                  @input="errors.legalName = ''"
                />
                <p v-if="errors.legalName" class="form-error">{{ errors.legalName }}</p>
              </div>
            </template>

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

            <!-- Endereço com autofill ViaCEP -->
            <div class="form-group">
              <label for="su-cep" class="form-label">CEP</label>
              <div class="auth-input-wrapper">
                <input
                  id="su-cep"
                  v-model="form.cep"
                  type="text"
                  class="form-input"
                  autocomplete="postal-code"
                  inputmode="numeric"
                  placeholder="00000-000"
                  maxlength="9"
                  required
                  :disabled="loading || cepLoading"
                  @input="onCepInput"
                  @blur="onCepBlur"
                />
                <span v-if="cepLoading" class="auth-input-spinner" aria-hidden="true"></span>
              </div>
              <p v-if="errors.cep" class="form-error">{{ errors.cep }}</p>
              <p v-else class="form-hint">Preenchemos o resto do endereço pra você.</p>
            </div>

            <div class="form-grid form-grid--2-1">
              <div class="form-group">
                <label for="su-street" class="form-label">Logradouro</label>
                <input
                  id="su-street"
                  v-model.trim="form.street"
                  type="text"
                  class="form-input"
                  autocomplete="address-line1"
                  placeholder="Rua / Avenida"
                  required
                  :disabled="loading"
                  @input="errors.street = ''"
                />
                <p v-if="errors.street" class="form-error">{{ errors.street }}</p>
              </div>
              <div class="form-group">
                <label for="su-number" class="form-label">Número</label>
                <input
                  id="su-number"
                  v-model.trim="form.streetNumber"
                  type="text"
                  class="form-input"
                  autocomplete="off"
                  placeholder="123"
                  maxlength="10"
                  required
                  :disabled="loading"
                  @input="errors.streetNumber = ''"
                />
                <p v-if="errors.streetNumber" class="form-error">{{ errors.streetNumber }}</p>
              </div>
            </div>

            <div class="form-group">
              <label for="su-complement" class="form-label">Complemento</label>
              <input
                id="su-complement"
                v-model.trim="form.complement"
                type="text"
                class="form-input"
                autocomplete="address-line2"
                placeholder="Apto, bloco, sala…"
                maxlength="60"
                required
                :disabled="loading"
                @input="errors.complement = ''"
              />
              <p v-if="errors.complement" class="form-error">{{ errors.complement }}</p>
            </div>

            <div class="form-grid form-grid--2-1">
              <div class="form-group">
                <label for="su-neighborhood" class="form-label">Bairro</label>
                <input
                  id="su-neighborhood"
                  v-model.trim="form.neighborhood"
                  type="text"
                  class="form-input"
                  autocomplete="address-level3"
                  required
                  :disabled="loading"
                  @input="errors.neighborhood = ''"
                />
                <p v-if="errors.neighborhood" class="form-error">{{ errors.neighborhood }}</p>
              </div>
              <div class="form-group">
                <label for="su-state" class="form-label">UF</label>
                <input
                  id="su-state"
                  v-model="form.stateCode"
                  type="text"
                  class="form-input form-input--centered"
                  autocomplete="address-level1"
                  placeholder="SP"
                  maxlength="2"
                  required
                  :disabled="loading"
                  @input="onStateInput"
                />
                <p v-if="errors.stateCode" class="form-error">{{ errors.stateCode }}</p>
              </div>
            </div>

            <div class="form-group">
              <label for="su-city" class="form-label">Cidade</label>
              <input
                id="su-city"
                v-model.trim="form.city"
                type="text"
                class="form-input"
                autocomplete="address-level2"
                required
                :disabled="loading"
                @input="errors.city = ''"
              />
              <p v-if="errors.city" class="form-error">{{ errors.city }}</p>
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

        <!-- ============ STEP 3 - Perfil profissional (Pro/Plus) ============ -->
        <template v-else-if="step === 'profile'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Perfil profissional</h1>
            <p class="auth-form-subtitle">Esses dados filtram as vagas que vamos te enviar.</p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitProfile">
            <div class="form-group">
              <span class="form-label">Área de atuação</span>
              <p class="form-hint" :class="{ 'form-hint--error': errors.areas }">
                Selecione uma ou mais. As vagas são filtradas pela sua área.
              </p>
              <div class="radio-group">
                <button
                  v-for="opt in areaOptions"
                  :key="opt.value"
                  type="button"
                  class="chip-option"
                  :class="{ 'chip-option--active': form.areas.includes(opt.value) }"
                  :disabled="loading"
                  @click="toggleArea(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
              <p v-if="errors.areas" class="form-error">{{ errors.areas }}</p>
            </div>

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
              </div>
            </div>

            <!-- Modelos de trabalho - Remoto sempre incluso, cliente escolhe se quer presencial/hibrido tambem -->
            <div class="form-group">
              <span class="form-label">Onde você quer trabalhar</span>
              <p class="form-hint">
                Vagas <strong>remotas você sempre recebe</strong>. Marque também se aceita presencial e/ou híbrido.
              </p>
              <div class="radio-group">
                <button
                  v-for="opt in workModelOptions"
                  :key="opt.value"
                  type="button"
                  class="chip-option"
                  :class="{ 'chip-option--active': form.workModels.includes(opt.value) }"
                  :disabled="loading"
                  @click="toggleWorkModel(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Localização - só pra hybrid/onsite. Prefill com cidade/UF do endereço pessoal -->
            <div v-if="needsLocation" class="form-group">
              <label for="su-job-location" class="form-label">Cidade pra trabalhar</label>
              <input
                id="su-job-location"
                v-model.trim="form.jobLocation"
                type="text"
                class="form-input"
                placeholder="São Paulo, SP"
                required
                :disabled="loading"
                @input="errors.jobLocation = ''"
              />
              <p v-if="errors.jobLocation" class="form-error">{{ errors.jobLocation }}</p>
              <p v-else class="form-hint">
                Usaremos isso pra filtrar vagas presenciais/híbridas perto de você.
              </p>
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

        <!-- ============ STEP OTP - Confirmação de email por código ============ -->
        <template v-else-if="step === 'otp'">
          <div class="auth-form-header">
            <p class="signup-eyebrow">{{ planLabel }}</p>
            <h1 class="auth-form-title">Confirme seu e-mail</h1>
            <p class="auth-form-subtitle">
              Enviamos um código de 8 dígitos para <strong>{{ form.email }}</strong>.
              Cole-o abaixo para ativar sua conta.
            </p>
          </div>

          <form class="auth-form" novalidate @submit.prevent="onSubmitOtp">
            <div class="form-group">
              <label for="su-otp" class="form-label">Código de verificação</label>
              <input
                id="su-otp"
                ref="otpInputRef"
                v-model="otpCode"
                type="text"
                class="form-input otp-input"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="••••••••"
                maxlength="8"
                :disabled="otpVerifying"
                @input="onOtpInput"
                @paste="onOtpPaste"
              />
              <p v-if="otpError" class="form-error">{{ otpError }}</p>
              <p v-else class="form-hint">Válido por 15 minutos. Não compartilhe com ninguém.</p>
            </div>

            <div class="signup-actions">
              <button
                type="submit"
                class="btn btn-primary btn-lg w-full"
                :disabled="otpVerifying || otpCode.length !== 8"
              >
                <span v-if="!otpVerifying">Confirmar e continuar</span>
                <span v-else>Verificando…</span>
              </button>
            </div>
          </form>

          <div class="otp-resend">
            <span v-if="resendCooldown > 0" class="form-hint">
              Reenviar em {{ resendCooldown }}s
            </span>
            <button
              v-else
              type="button"
              class="auth-help-link otp-resend__btn"
              :disabled="otpResending"
              @click="onResendOtp"
            >
              <span v-if="!otpResending">Não recebi · reenviar código</span>
              <span v-else>Reenviando…</span>
            </button>
          </div>

          <p v-if="resendMessage" class="signup-success__hint">{{ resendMessage }}</p>
        </template>

        <!-- ============ STEP DONE - Pós-verificação (redirecionando) ============ -->
        <template v-else>
          <div class="signup-success">
            <div class="signup-success__pulse" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="32" cy="32" r="5" fill="currentColor" stroke="none" />
                <circle cx="32" cy="32" r="14" opacity="0.55" />
                <circle cx="32" cy="32" r="22" opacity="0.3" />
              </svg>
            </div>
            <h1 class="auth-form-title">Tudo certo!</h1>
            <p class="auth-form-subtitle signup-success__lead">
              {{ confirmingCheckout ? 'Levando você para a tela de pagamento…' : 'Levando você para o painel…' }}
            </p>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/composables/useAuth'
import CountryPhoneInput from '@/components/CountryPhoneInput.vue'
import WhatsAppPhoneMockup from '@/components/WhatsAppPhoneMockup.vue'
import PasswordStrength from '@/components/PasswordStrength.vue'
import { STACK_GROUPS } from '@/data/stacks'
import {
  validateCPF, validateCNPJ, validateCEP,
  formatCPF, formatCNPJ, formatCEP,
} from '@/utils/validators'
import { fetchCEP } from '@/services/viaCep'

type Plan = 'free' | 'pro' | 'plus'
type Seniority = 'junior' | 'pleno' | 'senior' | 'staff_lead'
type PersonType = 'pf' | 'pj'
type WorkModel = 'remote' | 'hybrid' | 'onsite'
type Step = 'plan-select' | 'account' | 'personal' | 'profile' | 'otp' | 'done'

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
  // 'otp' e 'done' aparecem como última etapa do indicador.
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
    tagline: 'A IA seleciona as vagas alinhadas ao seu perfil.',
    featured: true,
    trial: true
  },
  {
    tier: 'pro' as const,
    label: 'Pro',
    price: 'R$ 5/mês',
    tagline: 'Todas as vagas de TI no seu canal exclusivo do WhatsApp.',
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

// Limites para a data de nascimento - minimo 14 anos, max 100 anos.
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

const confirmingCheckout = ref(false)

// ============ OTP de confirmação por email (8 dígitos) ============
const otpCode = ref('')
const otpError = ref('')
const otpVerifying = ref(false)
const otpResending = ref(false)
const otpInputRef = ref<HTMLInputElement | null>(null)
const resendCooldown = ref(0)
const resendMessage = ref('')
const RESEND_COOLDOWN_S = 60
let resendTimer: ReturnType<typeof setInterval> | null = null

function startResendCooldown(seconds = RESEND_COOLDOWN_S) {
  resendCooldown.value = seconds
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0) {
      resendCooldown.value = 0
      if (resendTimer) { clearInterval(resendTimer); resendTimer = null }
    }
  }, 1000)
}

function clearResendTimer() {
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null }
}

function onOtpInput(event: Event) {
  const target = event.target as HTMLInputElement
  const digits = target.value.replace(/\D/g, '').slice(0, 8)
  otpCode.value = digits
  target.value = digits
  otpError.value = ''
}

function onOtpPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const digits = text.replace(/\D/g, '').slice(0, 8)
  if (!digits) return
  event.preventDefault()
  otpCode.value = digits
  otpError.value = ''
}

async function onSubmitOtp() {
  if (otpCode.value.length !== 8 || otpVerifying.value) return
  otpVerifying.value = true
  otpError.value = ''
  try {
    const { data, error } = await supabase.functions.invoke('verify-signup-otp', {
      body: { email: form.email, code: otpCode.value }
    })
    if (error) {
      // Edge function retorna status no objeto error; default genérico.
      const status = (error as { context?: { status?: number } }).context?.status
      if (status === 404) {
        otpError.value = 'Não encontramos seu cadastro. Comece de novo.'
      } else {
        otpError.value = 'Código inválido ou expirado. Verifique e tente de novo.'
      }
      return
    }
    if (!data?.ok) {
      otpError.value = 'Código inválido. Tente novamente.'
      return
    }

    // Email confirmado. Faz login e segue pro checkout/dashboard.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password
    })
    if (signInError) {
      otpError.value = 'Email confirmado, mas falhou ao entrar. Tente fazer login manualmente.'
      setTimeout(() => router.push('/login'), 2500)
      return
    }

    step.value = 'done'
    await goToCheckoutOrDashboard()
  } catch (err) {
    console.error('[signup] verify-signup-otp error:', err)
    otpError.value = 'Erro ao verificar. Tente novamente em alguns segundos.'
  } finally {
    otpVerifying.value = false
  }
}

async function onResendOtp() {
  if (otpResending.value || resendCooldown.value > 0) return
  otpResending.value = true
  resendMessage.value = ''
  otpError.value = ''
  try {
    const { data, error } = await supabase.functions.invoke('resend-signup-otp', {
      body: { email: form.email }
    })
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status
      if (status === 429) {
        const retry = (data as { retry_after?: number } | null)?.retry_after ?? RESEND_COOLDOWN_S
        startResendCooldown(retry)
        resendMessage.value = `Aguarde ${retry}s antes de reenviar.`
      } else if (status === 409) {
        resendMessage.value = 'Email já confirmado. Vá para o login.'
      } else if (status === 404) {
        resendMessage.value = 'Cadastro não encontrado.'
      } else {
        resendMessage.value = 'Não foi possível reenviar agora. Tente em instantes.'
      }
      return
    }
    if (data?.ok) {
      resendMessage.value = 'Novo código enviado. Veja seu email.'
      startResendCooldown()
      otpCode.value = ''
      await nextTick()
      otpInputRef.value?.focus()
    }
  } catch (err) {
    console.error('[signup] resend-signup-otp error:', err)
    resendMessage.value = 'Erro ao reenviar. Tente em alguns segundos.'
  } finally {
    otpResending.value = false
  }
}

const form = reactive({
  // account
  email: '',
  password: '',
  // personal: identidade
  personType: 'pf' as PersonType,
  name: '',
  surname: '',
  birthDate: '',
  cpf: '',
  cnpj: '',
  legalName: '',
  phone: '',
  // personal: endereco
  cep: '',
  street: '',
  streetNumber: '',
  complement: '',
  neighborhood: '',
  city: '',
  stateCode: '',
  // profile (Pro/Plus)
  areas: [] as string[],
  stack: [] as string[],
  seniority: '' as Seniority | '',
  workModels: [] as Exclude<WorkModel, 'remote'>[],   // 'remote' eh implicito
  jobLocation: ''
})

const errors = reactive({
  email: '', password: '',
  name: '', surname: '', birthDate: '', phone: '',
  cpf: '', cnpj: '', legalName: '',
  cep: '', street: '', streetNumber: '', complement: '', neighborhood: '', city: '', stateCode: '',
  areas: '', stack: '', seniority: '', jobLocation: ''
})

const cepLoading = ref(false)

const personTypeOptions: { value: PersonType; label: string }[] = [
  { value: 'pf', label: 'Pessoa Física' },
  { value: 'pj', label: 'Pessoa Jurídica' }
]

const seniorityOptions: { value: Seniority; label: string }[] = [
  { value: 'junior',     label: 'Júnior' },
  { value: 'pleno',      label: 'Pleno' },
  { value: 'senior',     label: 'Sênior' },
  { value: 'staff_lead', label: 'Staff / Lead' }
]

const workModelOptions: { value: Exclude<WorkModel, 'remote'>; label: string }[] = [
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

const needsLocation = computed(() => form.workModels.length > 0)

function toggleStack(item: string) {
  const i = form.stack.indexOf(item)
  if (i >= 0) form.stack.splice(i, 1)
  else form.stack.push(item)
  if (form.stack.length > 0) errors.stack = ''
}

function toggleArea(value: string) {
  const i = form.areas.indexOf(value)
  if (i >= 0) form.areas.splice(i, 1)
  else form.areas.push(value)
  if (form.areas.length > 0) errors.areas = ''
}

function toggleWorkModel(value: Exclude<WorkModel, 'remote'>) {
  const i = form.workModels.indexOf(value)
  if (i >= 0) form.workModels.splice(i, 1)
  else form.workModels.push(value)

  // Prefill jobLocation a partir do endereco pessoal quando o cliente
  // habilita presencial/hibrido pela primeira vez.
  if (form.workModels.length > 0 && !form.jobLocation && form.city && form.stateCode) {
    form.jobLocation = `${form.city}, ${form.stateCode}`
  }
}

// --- Mascaras (input handlers) ------------------------------------------
function onCpfInput(event: Event) {
  const target = event.target as HTMLInputElement
  form.cpf = formatCPF(target.value)
  errors.cpf = ''
}

function onCnpjInput(event: Event) {
  const target = event.target as HTMLInputElement
  form.cnpj = formatCNPJ(target.value)
  errors.cnpj = ''
}

function onCepInput(event: Event) {
  const target = event.target as HTMLInputElement
  form.cep = formatCEP(target.value)
  errors.cep = ''
}

function onStateInput(event: Event) {
  const target = event.target as HTMLInputElement
  form.stateCode = target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
  errors.stateCode = ''
}

// --- Autofill ViaCEP ----------------------------------------------------
async function onCepBlur() {
  const clean = form.cep.replace(/\D/g, '')
  if (clean.length !== 8) return
  cepLoading.value = true
  try {
    const result = await fetchCEP(clean)
    if (!result) return  // CEP inexistente: cliente preenche manualmente
    if (result.street && !form.street)             form.street       = result.street
    if (result.neighborhood && !form.neighborhood) form.neighborhood = result.neighborhood
    if (result.city && !form.city)                 form.city         = result.city
    if (result.state && !form.stateCode)           form.stateCode    = result.state
  } finally {
    cepLoading.value = false
  }
}

function goBack() {
  clearAlert()
  if (step.value === 'profile')   step.value = 'personal'
  else if (step.value === 'personal') step.value = 'account'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  if (isAuthenticated.value) router.replace('/dashboard')
})

onUnmounted(() => {
  clearResendTimer()
})

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

  // Identificador: CPF (PF) ou CNPJ + Razão social (PJ)
  if (form.personType === 'pf') {
    if (!validateCPF(form.cpf)) { errors.cpf = 'CPF inválido.'; ok = false }
  } else {
    if (!validateCNPJ(form.cnpj)) { errors.cnpj = 'CNPJ inválido.'; ok = false }
    if (form.legalName.length < 2) { errors.legalName = 'Razão social obrigatória.'; ok = false }
  }

  if (form.phone.length < 10) { errors.phone = 'Telefone inválido. Inclua o DDD.'; ok = false }

  // Endereço - todos exceto complemento são obrigatórios
  if (!validateCEP(form.cep))           { errors.cep = 'CEP inválido.'; ok = false }
  if (!form.street.trim())              { errors.street = 'Logradouro obrigatório.'; ok = false }
  if (!form.streetNumber.trim())        { errors.streetNumber = 'Número obrigatório.'; ok = false }
  if (!form.complement.trim())          { errors.complement = 'Complemento obrigatório.'; ok = false }
  if (!form.neighborhood.trim())        { errors.neighborhood = 'Bairro obrigatório.'; ok = false }
  if (!form.city.trim())                { errors.city = 'Cidade obrigatória.'; ok = false }
  if (!/^[A-Z]{2}$/.test(form.stateCode)) { errors.stateCode = 'UF inválida.'; ok = false }

  return ok
}

function validateProfile() {
  let ok = true
  if (form.areas.length === 0) { errors.areas = 'Selecione pelo menos uma área.'; ok = false }
  if (!form.seniority) { errors.seniority = 'Escolha sua senioridade.'; ok = false }
  if (form.stack.length === 0) { errors.stack = 'Selecione pelo menos uma tecnologia.'; ok = false }
  // Se cliente marcou presencial ou híbrido, precisa informar cidade
  if (needsLocation.value && !form.jobLocation.trim()) {
    errors.jobLocation = 'Informe a cidade pra filtrar vagas presenciais/híbridas.'
    ok = false
  }
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
    // CPF/CNPJ/CEP enviados como dígitos puros (constraints do banco exigem regex ^[0-9]{n}$)
    const cpfDigits  = form.cpf.replace(/\D/g, '')
    const cnpjDigits = form.cnpj.replace(/\D/g, '')
    const cepDigits  = form.cep.replace(/\D/g, '')

    const metadata: Record<string, unknown> = {
      name: form.name,
      surname: form.surname,
      birth_date: form.birthDate,
      phone: form.phone,
      plan: plan.value,
      person_type: form.personType,
      cpf:        form.personType === 'pf' ? cpfDigits  : '',
      cnpj:       form.personType === 'pj' ? cnpjDigits : '',
      legal_name: form.personType === 'pj' ? form.legalName : '',
      cep: cepDigits,
      street: form.street,
      street_number: form.streetNumber,
      complement: form.complement,
      neighborhood: form.neighborhood,
      city: form.city,
      state_code: form.stateCode
    }

    if (plan.value !== 'free') {
      // Remoto eh sempre incluso. Cliente pode adicionar hybrid/onsite.
      const workModels: WorkModel[] = ['remote', ...form.workModels]
      metadata.profile = {
        whatsapp: form.phone,
        areas: form.areas,
        stack: form.stack,
        seniority: form.seniority,
        work_models: workModels,
        min_salary: null,
        location: needsLocation.value && form.jobLocation.trim()
          ? form.jobLocation.trim()
          : null
      }
    }

    // Cria conta via edge function (Admin API) e dispara código OTP.
    // O sign-in com senha + checkout só rodam depois do step OTP validar o email.
    const { data, error } = await supabase.functions.invoke('signup-with-otp', {
      body: {
        email: form.email,
        password: form.password,
        metadata
      }
    })

    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status
      if (status === 409) {
        throw new Error('already exists')
      }
      if (status === 400) {
        const errCode = (data as { error?: string } | null)?.error
        if (errCode === 'weak_password') throw new Error('weak password')
        if (errCode === 'invalid_email') throw new Error('invalid email')
      }
      throw error
    }

    // Transita para o input do código.
    step.value = 'otp'
    otpCode.value = ''
    otpError.value = ''
    resendMessage.value = ''
    startResendCooldown()
    window.scrollTo({ top: 0 })
    await nextTick()
    otpInputRef.value?.focus()
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
   Plan select - cards de selecao na primeira tela do cadastro
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
   Indicador de progresso - segmentos discretos
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

/* Logradouro + Número, Bairro + UF: proporção 2:1 em telas largas */
.form-grid--2-1 { grid-template-columns: 1fr; }
@media (min-width: 480px) {
  .form-grid--2-1 { grid-template-columns: 2fr 1fr; }
}

.form-input--centered {
  text-align: center;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.form-label-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: var(--font-regular);
  margin-left: 4px;
}

/* Spinner do CEP enquanto ViaCEP esta sendo consultado */
.auth-input-spinner {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 999px;
  animation: cep-spin 0.8s linear infinite;
}
@keyframes cep-spin {
  to { transform: translateY(-50%) rotate(360deg); }
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

/* OTP - input grande, monoespaçado, centralizado */
.otp-input {
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.5rem;
  letter-spacing: 0.4em;
  padding-left: 0.6em;  /* compensa o letter-spacing à esquerda */
  font-weight: 600;
  text-indent: 0.4em;
}
.otp-input::placeholder {
  letter-spacing: 0.3em;
  font-weight: 400;
  color: var(--color-text-muted);
}

.otp-resend {
  display: flex;
  justify-content: center;
  margin-top: var(--space-2);
}
.otp-resend__btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  font-weight: var(--font-medium);
  cursor: pointer;
}
.otp-resend__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Success - compacto, sem scroll */
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

/* Wide screens - formulario respira mais */
@media (min-width: 1440px) and (min-height: 900px) {
  .signup-container { max-width: 500px; }
  .stack-picker { max-height: 320px; }
}

@media (min-width: 1920px) and (min-height: 1080px) {
  .signup-container { max-width: 540px; }
  .stack-picker { max-height: 360px; }
}
</style>
