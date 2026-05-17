<template>
  <div class="djobs">
    <!-- Banner para perfil incompleto -->
    <div v-if="!profile && subscriber?.plan !== 'free'" class="djobs-banner">
      <div class="djobs-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" /><path d="M12 16h.01" />
        </svg>
      </div>
      <div class="djobs-banner__body">
        <h2>Complete seu perfil</h2>
        <p>Sem perfil de busca ainda não conseguimos filtrar vagas pra você.</p>
      </div>
      <router-link to="/dashboard/configuracoes" class="btn btn-primary">Configurar agora</router-link>
    </div>

    <!-- Banner para usuários free -->
    <div v-if="subscriber?.plan === 'free'" class="djobs-banner djobs-banner--upgrade">
      <div class="djobs-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="6" opacity="0.6" />
          <circle cx="12" cy="12" r="3" opacity="0.3" />
        </svg>
      </div>
      <div class="djobs-banner__body">
        <h2>Vagas filtradas pelo seu perfil</h2>
        <p>Disponível nos planos Pro e Plus. Faça upgrade para receber vagas do seu perfil.</p>
      </div>
      <router-link to="/dashboard/assinatura" class="btn btn-primary">Fazer upgrade</router-link>
    </div>

    <!-- Conectar WhatsApp do bot (Pro/Plus ainda não pareados) -->
    <div v-if="showWaCard" class="djobs-banner djobs-banner--wa">
      <div class="djobs-banner__icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 21l1.5-5.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
        </svg>
      </div>
      <div class="djobs-banner__body">
        <h2>Conecte seu WhatsApp</h2>
        <p>
          Pra receber as vagas do seu perfil direto no WhatsApp, conecte sua conta
          uma única vez. Seu código: <strong class="djobs-wa-code">{{ waToken }}</strong>
        </p>
      </div>
      <a :href="waDeepLink" target="_blank" rel="noopener" class="btn btn-primary">Conectar no WhatsApp</a>
    </div>

    <!-- Stats -->
    <div class="djobs-stats">
      <div class="djobs-stat">
        <span class="djobs-stat__icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
        <div class="djobs-stat__body">
          <span class="djobs-stat__num">{{ jobs.length }}</span>
          <span class="djobs-stat__label">vagas recebidas</span>
        </div>
      </div>
      <div class="djobs-stat">
        <span class="djobs-stat__icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" opacity="0.6" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div class="djobs-stat__body">
          <span class="djobs-stat__num">{{ topMatch }}<span class="djobs-stat__pct">%</span></span>
          <span class="djobs-stat__label">match no topo</span>
        </div>
      </div>
      <div class="djobs-stat">
        <span class="djobs-stat__icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        </span>
        <div class="djobs-stat__body">
          <span class="djobs-stat__num">{{ remoteCount }}</span>
          <span class="djobs-stat__label">vagas remotas</span>
        </div>
      </div>
      <div class="djobs-stat">
        <span class="djobs-stat__icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 16 14" />
          </svg>
        </span>
        <div class="djobs-stat__body">
          <span class="djobs-stat__num">{{ last24hCount }}</span>
          <span class="djobs-stat__label">últimas 24h</span>
        </div>
      </div>
    </div>

    <!-- Lista -->
    <ul v-if="jobs.length" class="djobs-list">
      <li
        v-for="job in jobs"
        :key="job.job_id"
        class="djobs-card"
        :class="[
          matchClass(job.match_score),
          { 'djobs-card--featured': (job.match_score ?? 0) >= 85 }
        ]"
      >
        <span class="djobs-card__rail" aria-hidden="true"></span>

        <!-- Cabeçalho: avatar + identidade + match (altura fixa) -->
        <header class="djobs-card__head">
          <span class="djobs-card__avatar" aria-hidden="true">{{ companyInitial(job.company) }}</span>
          <div class="djobs-card__ident">
            <h3 class="djobs-card__title" :title="job.title">{{ job.title }}</h3>
            <p class="djobs-card__company">{{ job.company || 'Empresa confidencial' }}</p>
          </div>
          <span
            v-if="job.match_score != null"
            class="djobs-match"
            :class="matchClass(job.match_score)"
            :aria-label="`${job.match_score}% de compatibilidade`"
          >
            <svg
              v-if="job.match_score >= 85"
              class="djobs-match__star"
              viewBox="0 0 16 16" width="9" height="9" fill="currentColor" aria-hidden="true"
            >
              <path d="M8 0l2.4 5 5.6.8-4 4 1 5.7L8 12.7l-5 2.7 1-5.7-4-4 5.6-.8z" />
            </svg>
            <span class="djobs-match__num">{{ job.match_score }}</span>
            <span class="djobs-match__sym">%</span>
          </span>
        </header>

        <!-- Faixa salarial (sempre presente — mantém o alinhamento) -->
        <div class="djobs-card__salary">
          <span class="djobs-card__salary-label">Faixa salarial</span>
          <span class="djobs-card__salary-value">{{ formatSalary(job) || 'A combinar' }}</span>
        </div>

        <!-- Skills (zona flexível — absorve a variação de altura) -->
        <div class="djobs-card__tags">
          <template v-if="job.skills && job.skills.length">
            <span
              v-for="t in job.skills.slice(0, 6)"
              :key="t"
              class="djobs-tag"
              :class="{ 'djobs-tag--hit': stackLower.has(t.toLowerCase()) }"
            >{{ t }}</span>
            <span v-if="job.skills.length > 6" class="djobs-tag djobs-tag--more">
              +{{ job.skills.length - 6 }}
            </span>
          </template>
          <span v-else class="djobs-tag djobs-tag--ghost">Skills não listadas</span>
        </div>

        <!-- Bloco inferior ancorado: fatos + rodapé + CTA sempre alinhados -->
        <div class="djobs-card__bottom">
          <div class="djobs-card__facts">
            <span class="djobs-fact djobs-fact--mode">{{ workLabel(job.work_type) || 'Modalidade n/d' }}</span>
            <span v-if="job.hiring_regime" class="djobs-fact">{{ job.hiring_regime }}</span>
            <span class="djobs-fact djobs-fact--loc">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {{ formatLocation(job) || 'Local não informado' }}
            </span>
            <span v-if="formatPubDate(job.publication_date)" class="djobs-fact djobs-fact--loc">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 3v4M16 3v4" />
              </svg>
              Publicada {{ formatPubDate(job.publication_date) }}
            </span>
          </div>

          <div class="djobs-card__foot">
            <span v-if="isFresh(job.sent_at)" class="djobs-card__new">Novo</span>
            <span class="djobs-card__foot-item">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 16 14" />
              </svg>
              Recebida {{ formatRelative(job.sent_at) }}
            </span>
            <span class="djobs-card__source">{{ sourceLabel(job.source) || 'via Sonnar' }}</span>
          </div>

          <a
            v-if="job.url"
            :href="job.url"
            target="_blank"
            rel="noopener"
            class="djobs-card__cta"
            :aria-label="`Ver vaga ${job.title}${job.company ? ' em ' + job.company : ''}`"
          >
            <span>Ver vaga</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
          <span v-else class="djobs-card__cta djobs-card__cta--off">Link indisponível</span>
        </div>
      </li>
    </ul>

    <p v-else-if="loading" class="djobs-empty">Carregando suas vagas…</p>

    <div v-else class="djobs-empty">
      <p class="djobs-empty__title">Nenhuma vaga por aqui ainda</p>
      <p class="djobs-empty__text">
        Assim que o Sonnar enviar vagas do seu perfil no WhatsApp, elas aparecem aqui.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

type Profile = Database['public']['Tables']['subscriber_profiles']['Row']

/**
 * Vaga entregue ao VIP — retorno da RPC get_my_vip_jobs().
 * A RPC já filtra pelo wa_lid do próprio usuário (cada VIP só vê o que recebeu)
 * e enriquece o snapshot da entrega com os dados completos da tabela `jobs`.
 */
type VipJob = {
  job_id: string
  sent_at: string
  match_score: number | null
  title: string
  company: string | null
  location: string | null
  state_code: string | null
  country_code: string | null
  work_type: string | null
  hiring_regime: string | null
  salary_raw: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  publication_date: string | null
  source: string | null
  skills: string[] | null
  url: string | null
}

const { subscriber } = useAuth()
const profile = ref<Profile | null>(null)
const jobs = ref<VipJob[]>([])
const loading = ref(true)

// ============= PAREAMENTO DO WHATSAPP =============
const waToken = ref<string | null>(null)
const waLinked = ref(false)

// Número do bot (mesmo da landing). Sem dígitos = sem deep-link.
const botPhone = (import.meta.env.VITE_WHATSAPP_PHONE || '').replace(/\D/g, '')

const showWaCard = computed(() =>
  subscriber.value?.plan !== 'free' &&
  !!profile.value &&
  !waLinked.value &&
  !!waToken.value &&
  !!botPhone
)

const waDeepLink = computed(() =>
  `https://wa.me/${botPhone}?text=${encodeURIComponent(`parear ${waToken.value || ''}`)}`
)

async function loadWaLinkStatus() {
  if (!profile.value || subscriber.value?.plan === 'free') return
  const { data, error } = await supabase.rpc('get_or_create_wa_link_token')
  if (error) {
    console.error('Falha ao obter código de pareamento:', error.message)
    return
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return
  waLinked.value = !!row.linked
  waToken.value = row.token ?? null
}

// ============= STATS =============
const topMatch = computed(() =>
  jobs.value.reduce((max, j) => Math.max(max, j.match_score ?? 0), 0)
)
const remoteCount = computed(() =>
  jobs.value.filter(j => workLabel(j.work_type) === 'Remoto').length
)
const last24hCount = computed(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000
  return jobs.value.filter(j => +new Date(j.sent_at) >= cutoff).length
})

// Skills do perfil — usadas pra destacar os chips compatíveis.
const stackLower = computed(() => {
  const s = new Set<string>()
  ;(profile.value?.stack || []).forEach(t => s.add(t.toLowerCase()))
  return s
})

// ============= FORMATAÇÃO =============
function matchClass(score: number | null) {
  const s = score ?? 0
  if (s >= 75) return 'djobs-match--high'
  if (s >= 50) return 'djobs-match--mid'
  return 'djobs-match--low'
}

function companyInitial(company: string | null) {
  return (company || 'Sonnar').trim().charAt(0).toUpperCase()
}

function isFresh(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000
}

/** Normaliza modalidade vinda crua ("remote") ou já traduzida ("Remoto"). */
function workLabel(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (s.includes('remot')) return 'Remoto'
  if (s.includes('hibr') || s.includes('híbr')) return 'Híbrido'
  if (s.includes('presen') || s.includes('onsite') || s.includes('on-site')) return 'Presencial'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** Limpa "Cidade - UF - Estado de X" -> "Cidade - UF". */
function formatLocation(job: VipJob): string | null {
  const loc = (job.location || '').trim()
  if (!loc) return null
  const match = loc.match(/^(.+?\s-\s[A-Za-z]{2})\s-\s.+$/)
  return (match ? match[1] : loc).trim()
}

function currencySymbol(code: string | null) {
  switch ((code || 'BRL').toUpperCase()) {
    case 'USD': return 'US$'
    case 'EUR': return '€'
    case 'GBP': return '£'
    default: return 'R$'
  }
}

/** Faixa salarial: usa o range numérico quando há; senão o texto cru. */
function formatSalary(job: VipJob): string | null {
  const sym = currencySymbol(job.salary_currency)
  const k = (n: number) => `${sym} ${(n / 1000).toFixed(0)}k`
  if (job.salary_min && job.salary_max) return `${k(job.salary_min)} – ${k(job.salary_max)}`
  if (job.salary_min) return `A partir de ${k(job.salary_min)}`
  if (job.salary_max) return `Até ${k(job.salary_max)}`

  const raw = (job.salary_raw || '').trim()
  if (!raw) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function formatPubDate(iso: string | null): string | null {
  if (!iso) return null
  const dt = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

function sourceLabel(source: string | null): string | null {
  const clean = (source || '').trim()
  if (!clean) return null
  return `via ${clean.charAt(0).toUpperCase() + clean.slice(1)}`
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  const months = Math.floor(d / 30)
  return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
}

// ============= CARGA DE DADOS =============
async function fetchProfile() {
  if (!subscriber.value?.id) return
  const { data } = await supabase
    .from('subscriber_profiles')
    .select('*')
    .eq('subscriber_id', subscriber.value.id)
    .maybeSingle()
  profile.value = data ?? null
}

async function fetchJobs() {
  // get_my_vip_jobs ainda não está nos tipos gerados — cast para any.
  const { data, error } = await (supabase as any).rpc('get_my_vip_jobs')
  if (error) {
    console.error('Falha ao carregar vagas recebidas:', error.message)
    jobs.value = []
    return
  }
  jobs.value = (data ?? []) as VipJob[]
}

onMounted(async () => {
  try {
    await fetchProfile()
    await Promise.all([loadWaLinkStatus(), fetchJobs()])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.djobs {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* Banners */
.djobs-banner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  transition: box-shadow var(--transition-base);
}
.djobs-banner:hover { box-shadow: var(--shadow-md); }

.djobs-banner--upgrade {
  background: linear-gradient(180deg, var(--color-accent-soft), var(--color-background));
  border-color: var(--color-accent);
}

.djobs-banner--wa {
  background: linear-gradient(180deg, rgba(37, 211, 102, 0.10), var(--color-background));
  border-color: rgba(37, 211, 102, 0.45);
}
.djobs-banner--wa .djobs-banner__icon {
  background: rgba(37, 211, 102, 0.14);
  color: #1faf55;
}
.djobs-wa-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 2px;
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
}

.djobs-banner__icon {
  display: grid;
  place-items: center;
  width: var(--control-height-md);
  height: var(--control-height-md);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  flex-shrink: 0;
}

.djobs-banner__body { flex: 1; min-width: 0; }
.djobs-banner__body h2 {
  font-size: var(--text-lg);
  margin: 0 0 2px;
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-tight);
}
.djobs-banner__body p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--lh-body);
}

@media (max-width: 600px) {
  .djobs-banner { flex-direction: column; align-items: flex-start; text-align: left; }
}

/* Stats — 4 cards idênticos (sem destaque), 2x2 no mobile, 1x4 a partir de 720px */
.djobs-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
@media (min-width: 720px) {
  .djobs-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.djobs-stat {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  min-height: 78px;
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  transition: border-color var(--transition-fast);
}
.djobs-stat:hover { border-color: var(--color-accent-muted); }

.djobs-stat__icon {
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

.djobs-stat__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.djobs-stat__num {
  display: flex;
  align-items: baseline;
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  color: var(--color-text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.djobs-stat__pct {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin-left: 2px;
  font-weight: var(--font-semibold);
}
.djobs-stat__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-text-muted);
  font-weight: var(--font-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Lista */
.djobs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}
@media (min-width: 640px)  { .djobs-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1040px) { .djobs-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1480px) { .djobs-list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

.djobs-card {
  position: relative;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-5);
  padding-left: calc(var(--space-5) + 3px);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow: hidden;
  transition: box-shadow var(--transition-base), border-color var(--transition-fast);
  isolation: isolate;
}

.djobs-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 60% at 100% 0%, var(--color-accent-soft), transparent 60%);
  opacity: 0;
  transition: opacity var(--transition-base);
  pointer-events: none;
  z-index: -1;
}
.djobs-card:hover { border-color: var(--color-accent-muted); }
.djobs-card:hover::after { opacity: 1; }
.djobs-card:focus-within {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

/* Variante featured (match >= 85%) */
.djobs-card--featured {
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-success) 4%, transparent), transparent 30%),
    var(--color-background);
}
.djobs-card--featured:hover {
  border-color: var(--color-success);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-success) 20%, transparent), var(--shadow-md);
}

/* Trilho lateral por match score */
.djobs-card__rail {
  position: absolute;
  left: 0;
  top: var(--space-4);
  bottom: var(--space-4);
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--color-border);
}
.djobs-card.djobs-match--high .djobs-card__rail { background: var(--color-success); }
.djobs-card.djobs-match--mid  .djobs-card__rail { background: var(--color-accent); }
.djobs-card.djobs-match--low  .djobs-card__rail { background: var(--color-warning); }

/* Cabeçalho */
.djobs-card__head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.djobs-card__avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-weight: var(--font-bold);
  font-size: var(--text-base);
  letter-spacing: var(--ls-tight);
}

.djobs-card__ident { flex: 1; min-width: 0; }

/* Título: reserva sempre 2 linhas — cards ficam idênticos independente do
   tamanho do nome da vaga. Título completo no atributo title (tooltip). */
.djobs-card__title {
  font-size: var(--text-lg);
  margin: 0 0 4px;
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  line-height: 1.3;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(1.3em * 2);
}

.djobs-card__company {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Disco de match */
.djobs-match {
  flex-shrink: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
  line-height: 1;
}
.djobs-match__star {
  align-self: center;
  margin-right: 2px;
}
.djobs-match__num {
  font-size: var(--text-base);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
}
.djobs-match__sym {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  opacity: 0.75;
}
.djobs-match--high {
  background: var(--color-success-soft);
  color: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
}
.djobs-match--mid {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.djobs-match--low {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
}

/* Skills — zona flexível que absorve a variação de altura entre cards */
.djobs-card__tags {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  min-height: 26px;
}
.djobs-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: var(--font-medium);
  white-space: nowrap;
  transition: all var(--transition-fast);
}
.djobs-card:hover .djobs-tag { border-color: var(--color-border); }
.djobs-tag--hit {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}
.djobs-tag--more {
  background: transparent;
  color: var(--color-text-muted);
  border-style: dashed;
}
.djobs-tag--ghost {
  background: transparent;
  color: var(--color-text-muted);
  border-style: dashed;
}

/* Faixa salarial */
.djobs-card__salary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-accent-soft), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, var(--color-border-subtle));
}
.djobs-card__salary-label {
  font-size: 10px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-accent);
  flex-shrink: 0;
}
.djobs-card__salary-value {
  font-size: var(--text-base);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  letter-spacing: var(--ls-tight);
  text-align: right;
}

/* Bloco inferior ancorado — facts + rodapé + CTA sempre no mesmo lugar */
.djobs-card__bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Fatos da vaga — altura fixa de 2 linhas: a linha de modalidade/regime/
   local/data fica sempre na mesma posição, quebrando ou não. */
.djobs-card__facts {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  min-height: 56px;
}
.djobs-fact {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: var(--font-semibold);
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
}
.djobs-fact--mode {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
  color: var(--color-accent);
}
.djobs-fact--loc {
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--font-medium);
}

/* Rodapé */
.djobs-card__foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.djobs-card__foot-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: var(--font-medium);
}
.djobs-card__dot {
  width: 3px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
  opacity: 0.5;
}
.djobs-card__source {
  margin-left: auto;
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
}
.djobs-card__new {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-text-inverse);
  font-size: 9px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  line-height: 1.5;
}

/* CTA */
.djobs-card__cta {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-button);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-weight: var(--font-semibold);
  text-decoration: none;
  font-size: var(--text-sm);
  letter-spacing: var(--ls-tight);
  min-height: var(--control-height-sm);
  transition: all var(--transition-fast);
}
.djobs-card__cta svg { transition: transform var(--transition-fast); }
.djobs-card__cta:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-inverse);
}
.djobs-card__cta:hover svg { transform: translateX(2px); }
.djobs-card__cta:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.djobs-card__cta:active { transform: translateY(1px); }

.djobs-card--featured .djobs-card__cta {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-inverse);
}
.djobs-card--featured .djobs-card__cta:hover {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

/* CTA desabilitado — vaga sem link (raro, mas mantém o card padronizado) */
.djobs-card__cta--off {
  cursor: not-allowed;
  opacity: 0.5;
}
.djobs-card__cta--off:hover {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

/* Estado vazio */
.djobs-empty {
  text-align: center;
  padding: var(--space-12) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-base);
}
.djobs-empty__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
}
.djobs-empty__text {
  margin: 0;
  font-size: var(--text-sm);
}
</style>
