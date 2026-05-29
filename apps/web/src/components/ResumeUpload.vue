<template>
  <!--
    Componente de upload de curriculo (Plus only).
    Fluxo:
      1. Cliente seleciona PDF/DOCX (max 10MB).
      2. Frontend sobe direto pro Supabase Storage `resumes/<sub_id>/<uuid>.<ext>`.
      3. Chama Edge Function `parse-resume` com o file_path.
      4. Mostra resultado: skills, anos, seniority, idiomas.
      5. Se ja existir curriculo ativo, exibe + permite substituir.
  -->
  <div class="resume-upload">
    <h3 class="resume-upload__title">📄 Meu currículo</h3>
    <p class="resume-upload__hint">
      Suba seu currículo (PDF ou DOCX, até 10MB). Extraímos suas skills,
      anos de experiência e nível para personalizar suas vagas.
      <strong>Tudo local, sem IA paga, sem custos.</strong>
    </p>

    <!-- Estado: ja tem curriculo ativo -->
    <div v-if="current && !uploading" class="resume-upload__current">
      <div class="resume-upload__current-header">
        <strong>{{ current.file_name || 'Currículo ativo' }}</strong>
        <span class="resume-upload__status" :class="`resume-upload__status--${current.parse_status}`">
          {{ statusLabel(current.parse_status) }}
        </span>
      </div>
      <div v-if="current.parse_status === 'done'" class="resume-upload__result">
        <div class="resume-upload__row">
          <span class="resume-upload__label">Skills detectadas:</span>
          <span>{{ current.extracted_skills.length || 0 }}</span>
        </div>
        <div v-if="current.extracted_skills?.length" class="resume-upload__chips">
          <span v-for="s in current.extracted_skills.slice(0, 25)" :key="s" class="resume-upload__chip">
            {{ s }}
          </span>
          <span v-if="current.extracted_skills.length > 25" class="resume-upload__chip resume-upload__chip--more">
            +{{ current.extracted_skills.length - 25 }}
          </span>
        </div>
        <div class="resume-upload__row">
          <span class="resume-upload__label">Anos de experiência:</span>
          <span>{{ current.years_total ?? '—' }}</span>
        </div>
        <div class="resume-upload__row">
          <span class="resume-upload__label">Senioridade:</span>
          <span>{{ current.seniority ? current.seniority.toUpperCase() : '—' }}</span>
        </div>
        <div class="resume-upload__row">
          <span class="resume-upload__label">Idiomas:</span>
          <span>{{ (current.languages || []).join(', ') || '—' }}</span>
        </div>
      </div>
      <div v-else-if="current.parse_status === 'failed'" class="resume-upload__error">
        Não foi possível processar este arquivo. Tente outro PDF/DOCX.
      </div>
    </div>

    <!-- Upload -->
    <div class="resume-upload__form">
      <label class="resume-upload__file">
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          :disabled="uploading"
          @change="onFile"
        />
        <span class="resume-upload__file-btn">
          {{ uploading ? 'Enviando…' : current ? 'Substituir currículo' : 'Enviar currículo' }}
        </span>
      </label>
      <p v-if="errorMsg" class="resume-upload__error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '../integrations/supabase/client'

interface ResumeRow {
  id: string
  file_name: string | null
  file_size: number | null
  extracted_skills: string[]
  years_total: number | null
  seniority: string | null
  languages: string[]
  parse_status: 'pending' | 'done' | 'failed'
  parsed_at: string | null
  created_at: string
}

const props = defineProps<{
  subscriberId: string
}>()

const current = ref<ResumeRow | null>(null)
const uploading = ref(false)
const errorMsg = ref<string | null>(null)

async function loadCurrent() {
  errorMsg.value = null
  const { data, error } = await supabase.rpc('get_my_active_resume')
  if (error) {
    errorMsg.value = 'Falha ao carregar currículo: ' + error.message
    return
  }
  current.value = (data && data[0]) || null
}

onMounted(loadCurrent)

function statusLabel(s: string): string {
  return s === 'done' ? '✓ processado' : s === 'failed' ? '✗ falhou' : '⏳ processando'
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await uploadAndParse(file)
  input.value = '' // limpa pra permitir re-upload do mesmo arquivo
}

function fileExtension(mime: string, name: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('wordprocessingml')) return 'docx'
  const ext = name.split('.').pop()?.toLowerCase()
  return ext || 'bin'
}

async function uploadAndParse(file: File) {
  errorMsg.value = null
  uploading.value = true
  try {
    const ext = fileExtension(file.type, file.name)
    const uuid = crypto.randomUUID()
    const filePath = `${props.subscriberId}/${uuid}.${ext}`

    // 1) Upload pro Storage (RLS valida que a pasta == subscriber_id do user)
    const { error: upErr } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (upErr) throw new Error(`upload_failed: ${upErr.message}`)

    // 2) Chama Edge Function
    const { data, error: fnErr } = await supabase.functions.invoke('parse-resume', {
      body: {
        subscriberId: props.subscriberId,
        filePath,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
      },
    })
    if (fnErr) throw new Error(`parse_failed: ${fnErr.message}`)
    if (data?.error) throw new Error(data.error)

    // 3) Recarrega o ativo (trigger ja moveu antigos pra is_active=false)
    await loadCurrent()
  } catch (err: unknown) {
    errorMsg.value = (err as Error).message || 'Erro desconhecido'
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.resume-upload {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  max-width: 720px;
}
.resume-upload__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #111827;
}
.resume-upload__hint {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 20px;
  line-height: 1.5;
}
.resume-upload__current {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.resume-upload__current-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.resume-upload__status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
}
.resume-upload__status--done   { background: #d1fae5; color: #065f46; }
.resume-upload__status--failed { background: #fee2e2; color: #991b1b; }
.resume-upload__status--pending{ background: #fef3c7; color: #92400e; }
.resume-upload__row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}
.resume-upload__label { color: #6b7280; }
.resume-upload__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.resume-upload__chip {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.resume-upload__chip--more { background: #f3f4f6; color: #6b7280; }
.resume-upload__form { display: flex; flex-direction: column; gap: 8px; }
.resume-upload__file input { display: none; }
.resume-upload__file-btn {
  display: inline-block;
  background: #2563eb;
  color: #fff;
  font-weight: 500;
  font-size: 14px;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.resume-upload__file-btn:hover { background: #1d4ed8; }
.resume-upload__file input:disabled + .resume-upload__file-btn {
  background: #9ca3af;
  cursor: not-allowed;
}
.resume-upload__error {
  color: #991b1b;
  font-size: 13px;
  margin: 4px 0 0;
}
</style>
