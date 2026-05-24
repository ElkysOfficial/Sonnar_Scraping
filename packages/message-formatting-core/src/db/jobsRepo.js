/**
 * Repository SQLite das vagas.
 *
 * Substitui o jobs.json + updateJobsFile do server.js antigo. Toda mutacao
 * vira INSERT/UPDATE/DELETE pontual, sem re-serializar o arquivo inteiro.
 *
 * Concorrencia: better-sqlite3 e sincrono e serializa writes via lock do
 * proprio SQLite (WAL mode). Nao precisamos de fila de promises como o
 * codigo anterior.
 *
 * sent_to e autoridade do core (bots marcam envio). Nas vagas vindas do
 * scraper via POST /jobs/batch, NUNCA sobrescrevemos sent_to com o que o
 * scraper mandou - preservamos o valor em disco.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPPORTED_CHANNELS = ["discord", "whatsapp", "telegram"]

function deriveId(jobUrl) {
  return crypto.createHash("md5").update(jobUrl).digest("hex")
}

function readSchemaSql() {
  return fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
}

/**
 * Abre/cria o banco no caminho dado e aplica o schema.
 *
 * WAL: writes nao bloqueiam reads (e vice-versa). Em workload de "muitos
 * batches do scraper + GETs do formatter", isso evita o timeout que o
 * fluxo antigo tinha quando uma escrita longa segurava o event loop.
 *
 * synchronous=NORMAL: bom equilibrio durabilidade/performance pra esse
 * caso (vagas: perder ate o ultimo segundo de writes em crash do SO e
 * aceitavel; o scraper reenvia o batch).
 *
 * busy_timeout: se outro processo segurar o lock, aguarda ate 5s em vez
 * de SQLITE_BUSY imediato.
 */
export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = NORMAL")
  db.pragma("busy_timeout = 5000")
  db.exec(readSchemaSql())
  return db
}

/**
 * Constroi as colunas indexadas (job_id, sent_to_*, publication_date, etc.)
 * a partir do entry. data_json carrega o entry INTEIRO pra round-trip exato.
 */
function entryToRow(entry) {
  const url = (entry.job_url || "").toString()
  const id = entry.id || (url ? deriveId(url) : "")
  const sentSet = new Set(Array.isArray(entry.sent_to) ? entry.sent_to : [])
  // data_json carrega o entry como veio (id incluso quando existe).
  return {
    job_url: url,
    job_id: id,
    job_title: (entry.job_title || "").toString(),
    company: entry.company || null,
    source: entry.source || null,
    publication_date: entry.publication_date || null,
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null,
    sent_to_discord: sentSet.has("discord") ? 1 : 0,
    sent_to_whatsapp: sentSet.has("whatsapp") ? 1 : 0,
    sent_to_telegram: sentSet.has("telegram") ? 1 : 0,
    data_json: JSON.stringify(entry)
  }
}

/**
 * Recupera o entry como estava no jobs.json. Alem de devolver o conteudo
 * do data_json, sobrescreve sent_to com o calculado das colunas - estas
 * sao a fonte da verdade de "ja enviei pra esse canal?".
 */
function rowToEntry(row) {
  if (!row) return null
  let entry
  try {
    entry = JSON.parse(row.data_json)
  } catch {
    entry = {}
  }
  const sentTo = []
  if (row.sent_to_discord) sentTo.push("discord")
  if (row.sent_to_whatsapp) sentTo.push("whatsapp")
  if (row.sent_to_telegram) sentTo.push("telegram")
  return {
    ...entry,
    job_url: row.job_url,
    sent_to: sentTo
  }
}

const UPSERT_SQL = `
INSERT INTO jobs (
  job_url, job_id, job_title, company, source, publication_date,
  created_at, updated_at,
  sent_to_discord, sent_to_whatsapp, sent_to_telegram,
  data_json
) VALUES (
  @job_url, @job_id, @job_title, @company, @source, @publication_date,
  @created_at, @updated_at,
  @sent_to_discord, @sent_to_whatsapp, @sent_to_telegram,
  @data_json
)
ON CONFLICT(job_url) DO UPDATE SET
  job_id           = excluded.job_id,
  job_title        = excluded.job_title,
  company          = excluded.company,
  source           = excluded.source,
  publication_date = excluded.publication_date,
  created_at       = COALESCE(jobs.created_at, excluded.created_at),
  updated_at       = excluded.updated_at,
  sent_to_discord  = excluded.sent_to_discord,
  sent_to_whatsapp = excluded.sent_to_whatsapp,
  sent_to_telegram = excluded.sent_to_telegram,
  data_json        = excluded.data_json
`

// Para batch do scraper: nao sobrescreve sent_to_* (autoridade do core).
// A leitura do entry existente acontece em upsertBatch e ja injeta o
// sent_to correto no data_json, mantendo as colunas/JSON consistentes.
// Como excluded.sent_to_* aqui ja chega calculado a partir do merge feito
// em upsertBatch (que copia old.sent_to), poderiamos usar UPSERT_SQL; mas
// manter um SQL distinto deixa claro o invariante e evita regressao caso
// algum caller esqueca de mesclar o sent_to.

export class JobsRepository {
  constructor(db) {
    this.db = db
    // Prepared statements - reuso = ordens de magnitude mais rapido.
    this._upsert = db.prepare(UPSERT_SQL)
    this._getByUrl = db.prepare("SELECT * FROM jobs WHERE job_url = ?")
    this._getById = db.prepare("SELECT * FROM jobs WHERE job_id = ?")
    this._deleteByUrl = db.prepare("DELETE FROM jobs WHERE job_url = ?")
    this._deleteById = db.prepare("DELETE FROM jobs WHERE job_id = ?")
    this._count = db.prepare("SELECT COUNT(*) AS n FROM jobs")
    this._all = db.prepare("SELECT * FROM jobs ORDER BY publication_date DESC, created_at DESC")
    this._purge = db.prepare("DELETE FROM jobs WHERE publication_date IS NOT NULL AND publication_date < ?")
    this._statsBySource = db.prepare("SELECT source, COUNT(*) AS n FROM jobs GROUP BY source")
    this._statsSent = db.prepare(`
      SELECT
        SUM(sent_to_discord)  AS discord,
        SUM(sent_to_whatsapp) AS whatsapp,
        SUM(sent_to_telegram) AS telegram
      FROM jobs
    `)
    // Transacao para batch upsert: tudo num write commit.
    this._upsertManyTx = db.transaction((entries) => {
      let upserted = 0
      for (const entry of entries) {
        this._upsert.run(entry)
        upserted++
      }
      return upserted
    })
  }

  // -------- writes --------

  /**
   * Upsert de UMA vaga. sent_to e tratado como autoridade do core:
   *  - sent_to_extra=true: o caller controla sent_to (ex: POST /jobs explicito).
   *  - sent_to_extra=false (default): preserva sent_to existente do banco;
   *    ignora qualquer sent_to vindo no entry (caso scraper batch).
   *
   * Retorna o entry persistido (apos merge).
   */
  upsertOne(entry, { preserveSentTo = true } = {}) {
    const url = entry.job_url
    if (!url || !entry.job_title) return null
    const existing = this._getByUrl.get(url)
    let merged
    if (existing) {
      const oldEntry = rowToEntry(existing)
      merged = {
        ...oldEntry,
        ...entry,
        // created_at sempre o do banco se ja existe (nao deixa scraper "rejuvenescer").
        created_at: oldEntry.created_at || entry.created_at,
        sent_to: preserveSentTo
          ? oldEntry.sent_to
          : (entry.sent_to || oldEntry.sent_to)
      }
    } else {
      merged = { ...entry }
      if (preserveSentTo && !merged.sent_to) merged.sent_to = []
    }
    const row = entryToRow(merged)
    this._upsert.run(row)
    return merged
  }

  /**
   * Upsert em lote (POST /jobs/batch). Sempre preserva sent_to existente -
   * o scraper nao tem autoridade sobre isso.
   *
   * Retorna { upserted, skipped }. Itens sem job_url/job_title sao skipped.
   * Toda a operacao roda em uma unica transacao SQLite.
   */
  upsertBatch(entries) {
    const valid = []
    let skipped = 0
    for (const entry of entries) {
      const url = (entry?.job_url || "").toString().trim()
      if (!url || !entry.job_title) {
        skipped++
        continue
      }
      const existing = this._getByUrl.get(url)
      const now = new Date().toISOString()
      let merged
      if (existing) {
        const old = rowToEntry(existing)
        merged = {
          ...old,
          ...entry,
          job_url: url,
          sent_to: old.sent_to, // autoridade do core
          created_at: old.created_at || entry.created_at || entry.scraped_at || now,
          updated_at: now
        }
      } else {
        merged = {
          ...entry,
          job_url: url,
          sent_to: [],
          created_at: entry.created_at || entry.scraped_at || now,
          updated_at: now
        }
      }
      valid.push(entryToRow(merged))
    }
    if (valid.length === 0) return { upserted: 0, skipped }
    const upserted = this._upsertManyTx(valid)
    return { upserted, skipped }
  }

  /**
   * Atualiza sent_to de UMA vaga para um canal (PUT /jobs/status).
   * Devolve o entry resultante, ou null se vaga nao existe.
   */
  setChannelStatus(jobId, channel, status) {
    const existing = this._getById.get(jobId)
    if (!existing) return null
    const entry = rowToEntry(existing)
    const sentSet = new Set(entry.sent_to || [])
    if (status) sentSet.add(channel)
    else sentSet.delete(channel)
    entry.sent_to = Array.from(sentSet).sort()
    entry.updated_at = new Date().toISOString()
    this._upsert.run(entryToRow(entry))
    return entry
  }

  /** DELETE /jobs/:id. Retorna true se deletou, false se nao achou. */
  deleteById(jobId) {
    const info = this._deleteById.run(jobId)
    return info.changes > 0
  }

  /** Purge: remove vagas com publication_date < cutoff. Devolve quantas. */
  purgeOlderThan(cutoffDateStr) {
    const info = this._purge.run(cutoffDateStr)
    return info.changes
  }

  // -------- reads --------

  /** Existe vaga com essa URL? Devolve { exists, id }. */
  checkUrl(url) {
    const row = this._getByUrl.get(url)
    if (!row) return { exists: false, id: null }
    return { exists: true, id: row.job_id }
  }

  /** Devolve o entry (formato jobs.json) ou null. */
  getById(jobId) {
    return rowToEntry(this._getById.get(jobId))
  }

  /** Todas as vagas, ordenadas por publication_date desc (entrega de /jobs). */
  listAll() {
    return this._all.all().map(rowToEntry)
  }

  /**
   * Pendentes para um canal (/jobs/pending?channel=X).
   *
   * ORDEM (v3.1.0): publication_date ASC = vagas mais antigas primeiro.
   * Decisao de produto: o bot deve enviar primeiro a vaga mais antiga
   * ainda nao vista pelo cliente, pra reduzir chance de vaga expirar
   * antes do envio.
   *
   * created_at ASC como tiebreaker quando duas vagas tem o mesmo
   * publication_date (ou ambos NULL).
   */
  listPending(channel) {
    const col = {
      discord: "sent_to_discord",
      whatsapp: "sent_to_whatsapp",
      telegram: "sent_to_telegram"
    }[channel]
    if (!col) return []
    const sql = `
      SELECT * FROM jobs
      WHERE ${col} = 0
      ORDER BY
        CASE WHEN publication_date IS NULL THEN 1 ELSE 0 END,
        publication_date ASC,
        created_at ASC
    `
    return this.db.prepare(sql).all().map(rowToEntry)
  }

  /** Total de vagas no banco. */
  count() {
    return this._count.get().n
  }

  /** Stats: total, pending por canal, enviados por canal, breakdown por source. */
  stats() {
    const total = this.count()
    const sentRow = this._statsSent.get() || {}
    const sent = {
      discord: Number(sentRow.discord) || 0,
      whatsapp: Number(sentRow.whatsapp) || 0,
      telegram: Number(sentRow.telegram) || 0
    }
    const bySource = {}
    for (const r of this._statsBySource.all()) {
      bySource[r.source || "unknown"] = r.n
    }
    return {
      total,
      pending: {
        discord: total - sent.discord,
        whatsapp: total - sent.whatsapp,
        telegram: total - sent.telegram
      },
      sent,
      bySource
    }
  }
}

export const _internal = { deriveId, entryToRow, rowToEntry, SUPPORTED_CHANNELS }
