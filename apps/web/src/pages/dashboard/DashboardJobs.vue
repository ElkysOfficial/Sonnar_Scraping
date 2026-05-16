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
        <p>Disponível nos planos Pro e Plus. Você está vendo uma prévia das vagas mais recentes.</p>
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
          <span class="djobs-stat__num">{{ filteredJobs.length }}</span>
          <span class="djobs-stat__label">{{ subscriber?.plan === 'free' ? 'vagas recentes' : 'vagas compatíveis' }}</span>
        </div>
      </div>
      <div class="djobs-stat djobs-stat--accent">
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
    <ul class="djobs-list">
      <li
        v-for="job in filteredJobs"
        :key="job.id"
        class="djobs-card"
        :class="[
          profile ? matchClass(job.score) : '',
          { 'djobs-card--featured': profile && job.score >= 85 }
        ]"
      >
        <span class="djobs-card__rail" aria-hidden="true"></span>

        <!-- Badges absolutos: novo + featured -->
        <div class="djobs-card__badges" aria-hidden="true">
          <span v-if="isFresh(job.posted_at)" class="djobs-badge djobs-badge--new">Novo</span>
          <span v-if="profile && job.score >= 85" class="djobs-badge djobs-badge--featured">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
              <path d="M8 0l2.4 5 5.6.8-4 4 1 5.7L8 12.7l-5 2.7 1-5.7-4-4 5.6-.8z" />
            </svg>
            Top match
          </span>
        </div>

        <header class="djobs-card__head">
          <div class="djobs-card__brand">
            <span class="djobs-card__avatar" aria-hidden="true">{{ companyInitial(job.company) }}</span>
            <div class="djobs-card__title">
              <h3>{{ job.title }}</h3>
              <p>{{ job.company }}</p>
            </div>
          </div>
          <span v-if="profile" class="djobs-match" :class="matchClass(job.score)" :aria-label="`${job.score}% de match`">
            <span class="djobs-match__num">{{ job.score }}</span>
            <span class="djobs-match__sym">%</span>
          </span>
        </header>

        <div class="djobs-card__tags">
          <span
v-for="t in job.tags.slice(0, 4)" :key="t"
            class="djobs-tag"
            :class="{ 'djobs-tag--hit': profile && stackLower.has(t.toLowerCase()) }"
          >{{ t }}</span>
          <span v-if="job.tags.length > 4" class="djobs-tag djobs-tag--more">+{{ job.tags.length - 4 }}</span>
        </div>

        <div class="djobs-card__salary">
          <span class="djobs-card__salary-label">Faixa</span>
          <span class="djobs-card__salary-value">{{ formatSalary(job.min_salary, job.max_salary) }}</span>
        </div>

        <div class="djobs-card__metas">
          <span class="djobs-card__meta">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 16 14" />
            </svg>
            {{ formatRelative(job.posted_at) }}
          </span>
          <span class="djobs-card__dot" aria-hidden="true"></span>
          <span class="djobs-card__meta djobs-card__meta--model">{{ workLabel(job.work_model) }}</span>
        </div>

        <a
          :href="job.url"
          target="_blank"
          rel="noopener"
          class="djobs-card__cta"
          :aria-label="`Ver vaga ${job.title} em ${job.company}`"
        >
          <span>Ver vaga</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </li>
    </ul>

    <p v-if="filteredJobs.length === 0" class="djobs-empty">
      Nenhuma vaga encontrada agora. Volte em breve.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

type Profile = Database['public']['Tables']['subscriber_profiles']['Row']

const { subscriber } = useAuth()
const profile = ref<Profile | null>(null)

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

// ============= MOCK DATA (até existir tabela jobs) =============
type MockJob = {
  id: string
  title: string
  company: string
  location: string
  work_model: 'remote' | 'hybrid' | 'onsite'
  seniority: 'junior' | 'pleno' | 'senior' | 'staff_lead'
  min_salary: number
  max_salary: number
  tags: string[]
  source: string
  url: string
  posted_at: string
}

const MOCK_JOBS: MockJob[] = [
  { id: '1',  title: 'Senior Frontend Engineer',  company: 'Nubank',         location: 'Remoto',          work_model: 'remote', seniority: 'senior',     min_salary: 18000, max_salary: 24000, tags: ['React', 'TypeScript', 'Next.js'],         source: 'LinkedIn',  url: 'https://linkedin.com', posted_at: hoursAgo(3) },
  { id: '2',  title: 'Staff Frontend Engineer',   company: 'iFood',          location: 'São Paulo, SP',   work_model: 'hybrid', seniority: 'staff_lead', min_salary: 28000, max_salary: 38000, tags: ['React', 'TypeScript', 'GraphQL'],         source: 'Gupy',      url: 'https://gupy.io',      posted_at: hoursAgo(8) },
  { id: '3',  title: 'Backend Engineer Pleno',    company: 'Mercado Livre',  location: 'Remoto · LATAM',  work_model: 'remote', seniority: 'pleno',      min_salary: 14000, max_salary: 19000, tags: ['Go', 'Kafka', 'Kubernetes'],              source: 'Glassdoor', url: 'https://glassdoor.com', posted_at: hoursAgo(14) },
  { id: '4',  title: 'Tech Lead Plataforma',      company: 'PicPay',         location: 'Remoto',          work_model: 'remote', seniority: 'staff_lead', min_salary: 25000, max_salary: 35000, tags: ['Node.js', 'AWS', 'TypeScript'],           source: 'LinkedIn',  url: 'https://linkedin.com', posted_at: hoursAgo(20) },
  { id: '5',  title: 'React Native Developer',    company: 'C6 Bank',        location: 'Remoto',          work_model: 'remote', seniority: 'pleno',      min_salary: 14000, max_salary: 19000, tags: ['React Native', 'TypeScript'],             source: 'LinkedIn',  url: 'https://linkedin.com', posted_at: hoursAgo(28) },
  { id: '6',  title: 'DevOps Engineer Sênior',    company: 'Stone',          location: 'Rio de Janeiro',  work_model: 'hybrid', seniority: 'senior',     min_salary: 16000, max_salary: 22000, tags: ['Kubernetes', 'Terraform', 'AWS'],         source: 'Indeed',    url: 'https://indeed.com',    posted_at: hoursAgo(36) },
  { id: '7',  title: 'Full Stack Engineer',       company: 'Loft',           location: 'Remoto',          work_model: 'remote', seniority: 'pleno',      min_salary: 12000, max_salary: 18000, tags: ['React', 'Node.js', 'PostgreSQL'],         source: 'Gupy',      url: 'https://gupy.io',      posted_at: hoursAgo(42) },
  { id: '8',  title: 'Senior Backend Engineer',   company: 'QuintoAndar',    location: 'São Paulo, SP',   work_model: 'hybrid', seniority: 'senior',     min_salary: 19000, max_salary: 26000, tags: ['Python', 'Django', 'AWS'],                source: 'Glassdoor', url: 'https://glassdoor.com', posted_at: hoursAgo(48) },
  { id: '9',  title: 'Mobile Engineer',           company: '99',             location: 'São Paulo, SP',   work_model: 'hybrid', seniority: 'pleno',      min_salary: 16000, max_salary: 21000, tags: ['Flutter', 'Dart', 'Firebase'],            source: 'Glassdoor', url: 'https://glassdoor.com', posted_at: hoursAgo(60) },
  { id: '10', title: 'Engenheiro de Dados Júnior',company: 'Hotmart',        location: 'Remoto · BR',     work_model: 'remote', seniority: 'junior',     min_salary: 7000,  max_salary: 10000, tags: ['Python', 'SQL', 'Airflow'],               source: 'Gupy',      url: 'https://gupy.io',      posted_at: hoursAgo(72) },
  { id: '11', title: 'Frontend Pleno Vue',        company: 'Movile',         location: 'Remoto',          work_model: 'remote', seniority: 'pleno',      min_salary: 11000, max_salary: 16000, tags: ['Vue', 'TypeScript', 'Nuxt'],              source: 'LinkedIn',  url: 'https://linkedin.com', posted_at: hoursAgo(84) }
]

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString()
}

// ============= MATCH SCORING =============
const stackLower = computed(() => {
  const s = new Set<string>()
  ;(profile.value?.stack || []).forEach(t => s.add(t.toLowerCase()))
  return s
})

function computeScore(job: MockJob) {
  if (!profile.value) return 0
  const tags = job.tags.map(t => t.toLowerCase())
  const overlap = tags.filter(t => stackLower.value.has(t)).length
  const stackScore = job.tags.length ? (overlap / job.tags.length) * 50 : 0
  const seniorityScore = profile.value.seniority === job.seniority ? 25 : 0
  const workScore = (profile.value.work_models || []).includes(job.work_model) ? 25 : 0
  return Math.round(stackScore + seniorityScore + workScore)
}

const filteredJobs = computed(() => {
  if (!profile.value) {
    // Free: ordena por mais recente, sem score
    return [...MOCK_JOBS]
      .sort((a, b) => +new Date(b.posted_at) - +new Date(a.posted_at))
      .map(j => ({ ...j, score: 0 }))
  }
  return MOCK_JOBS
    .map(j => ({ ...j, score: computeScore(j) }))
    .filter(j => j.score >= 25)
    .sort((a, b) => b.score - a.score)
})

const topMatch = computed(() => filteredJobs.value[0]?.score ?? 0)
const remoteCount = computed(() => filteredJobs.value.filter(j => j.work_model === 'remote').length)
const last24hCount = computed(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000
  return filteredJobs.value.filter(j => +new Date(j.posted_at) >= cutoff).length
})

function matchClass(score: number) {
  if (score >= 75) return 'djobs-match--high'
  if (score >= 50) return 'djobs-match--mid'
  return 'djobs-match--low'
}

function companyInitial(company: string) {
  return (company || '?').trim().charAt(0).toUpperCase()
}

function isFresh(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000
}

function workLabel(m: string) {
  return ({ remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' } as Record<string, string>)[m] || m
}

function formatSalary(min: number, max: number) {
  const fmt = (n: number) => `R$ ${(n / 1000).toFixed(0)}k`
  return `${fmt(min)} – ${fmt(max)}`
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'agora'
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

async function fetchProfile() {
  if (!subscriber.value?.id) return
  const { data } = await supabase
    .from('subscriber_profiles')
    .select('*')
    .eq('subscriber_id', subscriber.value.id)
    .maybeSingle()
  profile.value = data ?? null
}

onMounted(async () => {
  await fetchProfile()
  await loadWaLinkStatus()
})
</script>

<style scoped>
.djobs {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.djobs-top {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}
@media (min-width: 900px) {
  .djobs-top { grid-template-columns: 2fr 1fr; align-items: stretch; }
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

/* Stats */
.djobs-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
@media (min-width: 720px) {
  .djobs-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.djobs-stat {
  position: relative;
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  transition: box-shadow var(--transition-base), border-color var(--transition-fast), transform var(--transition-fast);
}
.djobs-stat:hover {
  border-color: var(--color-accent-muted);
}

.djobs-stat--accent {
  background: linear-gradient(140deg, var(--color-accent-soft), transparent 70%), var(--color-background);
  border-color: color-mix(in srgb, var(--color-accent) 25%, var(--color-border));
}

.djobs-stat__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-accent);
}
.djobs-stat--accent .djobs-stat__icon {
  background: var(--color-accent);
  color: var(--color-text-inverse);
  border-color: transparent;
  box-shadow: var(--shadow-sm);
}

.djobs-stat__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.djobs-stat__num {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  color: var(--color-text-primary);
  line-height: var(--lh-tight);
  font-variant-numeric: tabular-nums;
}
.djobs-stat__pct {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  margin-left: 1px;
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
  gap: var(--space-3);
}
@media (min-width: 640px)  { .djobs-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 960px)  { .djobs-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1200px) { .djobs-list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (min-width: 1500px) { .djobs-list { grid-template-columns: repeat(5, minmax(0, 1fr)); } }

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
  transition: box-shadow var(--transition-base), border-color var(--transition-fast), transform var(--transition-fast);
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

.djobs-card:hover {
  border-color: var(--color-accent-muted);
}
.djobs-card:hover::after { opacity: 1; }

.djobs-card:focus-within {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

/* Variante featured (high match >= 85%) */
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

/* Trilho lateral colorido por match score */
.djobs-card__rail {
  position: absolute;
  left: 0;
  top: var(--space-4);
  bottom: var(--space-4);
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--color-border);
  transition: background var(--transition-fast);
}
.djobs-card.djobs-match--high .djobs-card__rail { background: var(--color-success); }
.djobs-card.djobs-match--mid  .djobs-card__rail { background: var(--color-accent); }
.djobs-card.djobs-match--low  .djobs-card__rail { background: var(--color-warning); }

/* Badges absolutos no topo direito */
.djobs-card__badges {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  z-index: 2;
  pointer-events: none;
}

.djobs-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  line-height: 1.4;
}
.djobs-badge--new {
  background: var(--color-accent);
  color: var(--color-text-inverse);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--color-accent) 60%, transparent);
}
.djobs-badge--featured {
  background: color-mix(in srgb, var(--color-success) 15%, var(--color-background));
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
}

/* Cabeçalho */
.djobs-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.djobs-card__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
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

.djobs-card__title { min-width: 0; flex: 1; }
.djobs-card__title h3 {
  font-size: var(--text-lg);
  margin: 0 0 3px;
  font-weight: var(--font-bold);
  letter-spacing: var(--ls-tight);
  line-height: 1.2;
  color: var(--color-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.djobs-card__title p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Match badge - disco numérico */
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

/* Tags */
.djobs-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  letter-spacing: -0.005em;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.djobs-card:hover .djobs-tag {
  border-color: var(--color-border);
}

.djobs-tag:hover {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.djobs-tag--hit {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
  color: var(--color-accent);
  font-weight: var(--font-semibold);
}
.djobs-tag--hit:hover {
  background: color-mix(in srgb, var(--color-accent) 18%, var(--color-background));
  border-color: var(--color-accent);
}

.djobs-tag--more {
  background: transparent;
  color: var(--color-text-muted);
  border-style: dashed;
}

/* Zona de destaque salarial */
.djobs-card__salary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-accent-soft), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, var(--color-border-subtle));
  transition: border-color var(--transition-fast);
}
.djobs-card:hover .djobs-card__salary {
  border-color: var(--color-accent-muted);
}
.djobs-card__salary-label {
  font-size: 10px;
  font-weight: var(--font-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--color-accent);
}
.djobs-card__salary-value {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-text-primary);
  letter-spacing: var(--ls-tight);
  font-variant-numeric: tabular-nums;
}

/* Linha de metadados */
.djobs-card__metas {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-wrap: wrap;
}

.djobs-card__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: var(--font-medium);
}
.djobs-card__meta--model {
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
}

.djobs-card__dot {
  width: 3px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
  opacity: 0.5;
}

/* CTA como botao real, nao link perdido */
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

.djobs-card__cta svg {
  transition: transform var(--transition-fast);
}

.djobs-card__cta:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-inverse);
}
.djobs-card__cta:hover svg {
  transform: translateX(2px);
}

.djobs-card__cta:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.djobs-card__cta:active {
  transform: translateY(1px);
}

.djobs-card--featured .djobs-card__cta {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-inverse);
}
.djobs-card--featured .djobs-card__cta:hover {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.djobs-empty {
  text-align: center;
  padding: var(--space-12) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-base);
}
</style>
