import { ref, readonly } from 'vue'
import { supabase } from '@/integrations/supabase/client'

// Singletons - uma unica chamada por sessao serve toda a landing.
const stats = ref({ total_count: 0, last_week_count: 0, last_scraped_at: null })
const jobsByUF = ref({})        // { SP: 12543, RJ: 4567, ... }
const jobsByCountry = ref({})   // { BR: 35234, US: 8934, ... }
const loading = ref(false)
const error = ref(null)
let inflight = null
let lastFetchedAt = 0

const CACHE_MS = 60_000  // 1 min

async function fetchAll() {
  loading.value = true
  error.value = null
  try {
    const [statsRes, ufRes, countryRes] = await Promise.all([
      supabase.rpc('get_jobs_stats'),
      supabase.rpc('get_jobs_by_uf'),
      supabase.rpc('get_jobs_by_country')
    ])

    if (statsRes.error) throw statsRes.error
    if (ufRes.error) throw ufRes.error
    if (countryRes.error) throw countryRes.error

    // get_jobs_stats retorna array com 1 linha (SETOF) - pega a primeira
    const statsRow = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data
    if (statsRow) {
      stats.value = {
        total_count: Number(statsRow.total_count ?? 0),
        last_week_count: Number(statsRow.last_week_count ?? 0),
        last_scraped_at: statsRow.last_scraped_at ?? null
      }
    }

    jobsByUF.value = (ufRes.data ?? []).reduce((acc, row) => {
      if (row.state_code) acc[row.state_code] = Number(row.count)
      return acc
    }, {})

    jobsByCountry.value = (countryRes.data ?? []).reduce((acc, row) => {
      // 'WW' eh code customizado pra Worldwide — fora do mapa.
      if (row.country_code && row.country_code !== 'WW') {
        acc[row.country_code] = Number(row.count)
      }
      return acc
    }, {})

    lastFetchedAt = Date.now()
  } catch (e) {
    error.value = e
    // Mantem valores anteriores (0 ou cache) - UI nao quebra
  } finally {
    loading.value = false
  }
}

export function useJobsCoverage() {
  async function load({ force = false } = {}) {
    const fresh = Date.now() - lastFetchedAt < CACHE_MS
    if (!force && fresh) return
    if (inflight) return inflight
    inflight = fetchAll().finally(() => { inflight = null })
    return inflight
  }

  return {
    stats: readonly(stats),
    jobsByUF: readonly(jobsByUF),
    jobsByCountry: readonly(jobsByCountry),
    loading: readonly(loading),
    error: readonly(error),
    load
  }
}
