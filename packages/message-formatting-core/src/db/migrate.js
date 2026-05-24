/**
 * Migracao one-shot do jobs.json legado para SQLite.
 *
 * Roda no boot do core. Idempotente:
 *  - Se o banco ja contem vagas, NAO faz nada (ja migrou).
 *  - Se o jobs.json nao existe, NAO faz nada (instalacao limpa).
 *  - Se ha jobs.json e o banco esta vazio, importa tudo em uma transacao
 *    e renomeia o jobs.json para .bak-<timestamp> (preservado em disco).
 *
 * O backup do jobs.json e crucial: se algo der errado pos-cutover, o
 * arquivo original esta intacto e o repo pode ser reconstruido.
 */
import fs from "node:fs"
import path from "node:path"

export function migrateJsonToSqlite({ jobsJsonPath, repo, logger = console } = {}) {
  if (!jobsJsonPath) throw new Error("migrate: jobsJsonPath obrigatorio")
  if (!repo) throw new Error("migrate: repo obrigatorio")

  const existingCount = repo.count()
  if (existingCount > 0) {
    logger.log(`[core] migrate: banco ja tem ${existingCount} vaga(s), pulando importacao do jobs.json`)
    return { status: "skipped", reason: "db_not_empty", count: existingCount }
  }

  if (!fs.existsSync(jobsJsonPath)) {
    logger.log(`[core] migrate: jobs.json nao existe em ${jobsJsonPath} (instalacao limpa)`)
    return { status: "skipped", reason: "no_legacy_file", count: 0 }
  }

  const stats = fs.statSync(jobsJsonPath)
  const startedAt = Date.now()
  logger.log(`[core] migrate: importando jobs.json (${(stats.size / 1024 / 1024).toFixed(1)}MB) -> SQLite`)

  let raw
  try {
    raw = fs.readFileSync(jobsJsonPath, "utf8").trim()
  } catch (err) {
    logger.error(`[core] migrate: falha ao ler jobs.json: ${err.message}`)
    throw err
  }
  if (!raw) {
    logger.log("[core] migrate: jobs.json vazio, nada a importar")
    return { status: "skipped", reason: "empty_file", count: 0 }
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    logger.error(`[core] migrate: jobs.json invalido (parse falhou): ${err.message}`)
    throw err
  }

  // O jobs.json antigo e um dict { [job_url]: entry }. Cada entry pode nao
  // ter o job_url interno (o url era a chave). Garantimos esse campo antes
  // do upsert para o repo.
  const entries = []
  for (const [url, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== "object") continue
    entries.push({ ...entry, job_url: entry.job_url || url })
  }

  // preserveSentTo nao se aplica aqui (banco vazio). Reusa upsertBatch que ja
  // trata 'sent_to' vindo do entry: como nao havera linha pre-existente,
  // o sent_to vai pra zero (no jobs.json antigo existia 'sent_to' no proprio
  // entry - precisamos preservar isso porque sao registros do envio passado).
  // Por isso fazemos passada manual usando upsertOne com preserveSentTo=false
  // dentro de uma transacao do db, em chunks pra nao explodir uso de memoria.
  const CHUNK = 1000
  let imported = 0
  const db = repo.db
  const tx = db.transaction((chunk) => {
    for (const entry of chunk) {
      repo.upsertOne(entry, { preserveSentTo: false })
    }
  })
  for (let i = 0; i < entries.length; i += CHUNK) {
    tx(entries.slice(i, i + CHUNK))
    imported += Math.min(CHUNK, entries.length - i)
    if (imported % 10000 === 0 || imported === entries.length) {
      logger.log(`[core] migrate: ${imported}/${entries.length} vagas importadas`)
    }
  }

  // Backup do jobs.json para nao perder o original. Mantemos por 30 dias
  // ou ate sysadmin remover manualmente.
  const bakPath = `${jobsJsonPath}.bak-${Date.now()}`
  try {
    fs.renameSync(jobsJsonPath, bakPath)
    logger.log(`[core] migrate: jobs.json renomeado para ${path.basename(bakPath)} (backup)`)
  } catch (err) {
    logger.warn(`[core] migrate: nao foi possivel renomear jobs.json para backup: ${err.message}`)
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  logger.log(`[core] migrate: concluido - ${imported} vaga(s) em ${elapsedSec}s`)
  return { status: "migrated", count: imported, backupPath: bakPath }
}
