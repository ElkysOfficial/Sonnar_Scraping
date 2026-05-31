<template>
  <!--
    Form de consultoria humana (Plus only).
    Fluxo:
      1. Cliente preenche LinkedIn URL + objetivo + (opcional) CV PDF + vaga-alvo
      2. CV vai pro Storage `consultoria-cvs/<sub_id>/<uuid>.pdf`
      3. Frontend chama Edge Function `submit-consultoria`
      4. Edge function valida Plus, salva row e dispara WhatsApp pro admin
      5. Tela mostra historico dos pedidos com status visual
  -->
  <div class="consultoria">
    <div class="consultoria__intro">
      <h3 class="consultoria__title">🎯 Solicitar consultoria</h3>
      <p class="consultoria__hint">
        Conversa individual de até 45min com a gente. Vamos revisar seu LinkedIn,
        analisar seu currículo e te apontar ajustes práticos pra você ser chamado
        pras vagas certas. Combinaremos o horário pelo WhatsApp depois que você enviar.
      </p>
    </div>

    <form class="consultoria__form" @submit.prevent="onSubmit">
      <label class="consultoria__field">
        <span class="consultoria__label">LinkedIn (obrigatório)</span>
        <input
          v-model="form.linkedinUrl"
          type="url"
          placeholder="https://www.linkedin.com/in/seu-perfil"
          required
          :disabled="submitting"
        />
      </label>

      <label class="consultoria__field">
        <span class="consultoria__label">O que você quer melhorar? (obrigatório)</span>
        <textarea
          v-model="form.objetivo"
          rows="4"
          placeholder="Ex.: estou em transição pra dev backend, quero ajustar o CV pra vagas Python e revisar meu LinkedIn"
          minlength="10"
          maxlength="2000"
          required
          :disabled="submitting"
        />
        <span class="consultoria__counter">{{ form.objetivo.length }} / 2000</span>
      </label>

      <label class="consultoria__field">
        <span class="consultoria__label">Vaga-alvo (opcional)</span>
        <input
          v-model="form.vagaAlvoUrl"
          type="url"
          placeholder="Link de uma vaga que você quer focar"
          :disabled="submitting"
        />
      </label>

      <label class="consultoria__field">
        <span class="consultoria__label">Currículo (opcional, PDF até 10MB)</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          :disabled="submitting"
          @change="onFile"
        />
        <span v-if="cvFile" class="consultoria__file-name">📎 {{ cvFile.name }}</span>
      </label>

      <p v-if="errorMsg" class="consultoria__error">{{ errorMsg }}</p>
      <p v-if="successMsg" class="consultoria__success">{{ successMsg }}</p>

      <button type="submit" class="btn btn-primary" :disabled="submitting">
        {{ submitting ? 'Enviando…' : 'Solicitar consultoria' }}
      </button>
    </form>

    <!-- Historico -->
    <div v-if="history.length" class="consultoria__history">
      <h4>Seus pedidos</h4>
      <div v-for="r in history" :key="r.id" class="consultoria__item">
        <div class="consultoria__item-head">
          <span :class="['consultoria__status', `consultoria__status--${r.status}`]">
            {{ statusLabel(r.status) }}
          </span>
          <span class="consultoria__item-date">
            {{ formatDate(r.created_at) }}
          </span>
        </div>
        <div v-if="r.scheduled_at" class="consultoria__item-scheduled">
          📅 Agendada: {{ formatDateTime(r.scheduled_at) }}
        </div>
        <div class="consultoria__item-obj">{{ truncate(r.objetivo, 140) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { supabase } from '../integrations/supabase/client'

const props = defineProps({
  subscriberId: { type: String, required: true },
})

const form = reactive({
  linkedinUrl: '',
  objetivo: '',
  vagaAlvoUrl: '',
})
const cvFile = ref(null)
const submitting = ref(false)
const errorMsg = ref(null)
const successMsg = ref(null)
const history = ref([])

const STATUS_LABEL = {
  pending: 'Pendente',
  scheduled: 'Agendada',
  done: 'Concluída',
  cancelled: 'Cancelada',
}

function statusLabel(s) {
  return STATUS_LABEL[s] || s
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function onFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  if (f.size > 10 * 1024 * 1024) {
    errorMsg.value = 'Arquivo maior que 10MB. Envie um PDF menor.'
    e.target.value = ''
    return
  }
  errorMsg.value = null
  cvFile.value = f
}

async function loadHistory() {
  const { data, error } = await supabase
    .from('consultoria_requests')
    .select('id, status, scheduled_at, objetivo, created_at')
    .eq('subscriber_id', props.subscriberId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (!error) history.value = data || []
}

onMounted(loadHistory)

async function uploadCv() {
  if (!cvFile.value) return null
  const uuid = crypto.randomUUID()
  const filePath = `${props.subscriberId}/${uuid}.pdf`
  const { error } = await supabase.storage
    .from('consultoria-cvs')
    .upload(filePath, cvFile.value, {
      contentType: cvFile.value.type || 'application/pdf',
      upsert: false,
    })
  if (error) throw new Error(`upload_cv_failed: ${error.message}`)
  return {
    cvFilePath: filePath,
    cvFileName: cvFile.value.name,
    cvFileSize: cvFile.value.size,
  }
}

async function onSubmit() {
  errorMsg.value = null
  successMsg.value = null
  submitting.value = true
  try {
    const cvFields = await uploadCv()

    const { data, error: fnErr } = await supabase.functions.invoke('submit-consultoria', {
      body: {
        subscriberId: props.subscriberId,
        linkedinUrl: form.linkedinUrl.trim(),
        objetivo: form.objetivo.trim(),
        vagaAlvoUrl: form.vagaAlvoUrl.trim() || undefined,
        ...(cvFields || {}),
      },
    })
    if (fnErr) throw new Error(fnErr.message)
    if (data?.error) throw new Error(data.error)

    successMsg.value = 'Pedido enviado. Vamos te chamar no WhatsApp pra combinar o horário.'
    form.linkedinUrl = ''
    form.objetivo = ''
    form.vagaAlvoUrl = ''
    cvFile.value = null
    await loadHistory()
  } catch (err) {
    errorMsg.value = err?.message || 'Erro desconhecido'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.consultoria {
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 16px;
  padding: 24px;
}

.consultoria__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
}

.consultoria__hint {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
  line-height: 1.5;
}

.consultoria__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.consultoria__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.consultoria__label {
  font-size: 13px;
  font-weight: 500;
}

.consultoria__field input,
.consultoria__field textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  font: inherit;
  color: inherit;
}

.consultoria__field textarea {
  resize: vertical;
  min-height: 96px;
}

.consultoria__counter {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  align-self: flex-end;
}

.consultoria__file-name {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.consultoria__error {
  color: #b91c1c;
  font-size: 14px;
  margin: 0;
}

.consultoria__success {
  color: #047857;
  font-size: 14px;
  margin: 0;
}

.consultoria__history {
  border-top: 1px solid var(--color-border, #e5e7eb);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.consultoria__history h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.consultoria__item {
  padding: 12px;
  border-radius: 8px;
  background: var(--color-surface-alt, #f9fafb);
  border: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.consultoria__item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.consultoria__status {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.consultoria__status--pending {
  background: #fef3c7;
  color: #92400e;
}
.consultoria__status--scheduled {
  background: #d1fae5;
  color: #065f46;
}
.consultoria__status--done {
  background: #e0e7ff;
  color: #3730a3;
}
.consultoria__status--cancelled {
  background: #f3f4f6;
  color: #6b7280;
}

.consultoria__item-date {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.consultoria__item-scheduled {
  font-size: 13px;
  font-weight: 500;
}

.consultoria__item-obj {
  font-size: 13px;
  color: var(--color-text, #374151);
  line-height: 1.4;
}
</style>
