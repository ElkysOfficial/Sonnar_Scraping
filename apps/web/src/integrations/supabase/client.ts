import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

// Configuração de auth:
//   - persistSession: true     → token sobrevive a reload (storage abaixo)
//   - autoRefreshToken: true   → SDK refresha access token antes de expirar
//   - detectSessionInUrl: true → captura `?code=` em fluxos OAuth/PKCE
//   - flowType: 'pkce'         → fluxo recomendado pra SPA (sem secret)
//   - storage: localStorage    → mesmo origem; tokens só são acessíveis ao
//     próprio app (anon key + RLS no banco). Para HTTP-only cookies seria
//     necessário um back-end intermediário, fora do escopo desta arquitetura.
//
// Importante: o LISTENER global de auth e o tracker de inatividade vivem em
// `@/composables/useAuth` (bootAuth). Não duplicar handlers aqui.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
})
