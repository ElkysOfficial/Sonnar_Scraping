/**
 * Reexporta o cliente Supabase do Sonnar (database.js) num modulo com
 * a mesma interface do elkysClient.js — permite lookupContact tratar
 * ambos os bancos com o mesmo padrao getXClient() retornando null em
 * caso de indisponibilidade.
 */
import { supabase } from "../database.js"

export function getSonnarClient() {
  return supabase || null
}
