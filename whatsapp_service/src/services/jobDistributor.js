/**
 * Distribuidor de vagas com seleção aleatória, justa e diversificada.
 * Evita viés por ordem de arquivo e garante diversidade de stacks.
 */

/**
 * Gerador de números pseudo-aleatórios com seed (Mulberry32).
 * Determinístico: mesma seed = mesma sequência.
 * @param {number} seed
 * @returns {() => number} Função que retorna número entre 0 e 1
 */
export function seededRng(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Gera seed a partir de groupId + data (YYYY-MM-DD).
 * Garante aleatoriedade determinística por grupo e dia.
 * @param {string} groupId
 * @param {Date} [date]
 * @returns {number}
 */
export function generateSeed(groupId, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10)
  const str = `${groupId}:${dateStr}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Fisher-Yates shuffle com RNG customizado.
 * @template T
 * @param {T[]} array
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(array, rng = Math.random) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Extrai a stack/categoria de uma vaga.
 * Tenta vários campos possíveis.
 * @param {object} job
 * @returns {string}
 */
export function extractStack(job) {
  // Campos diretos
  if (job.stack) return job.stack.toLowerCase()
  if (job.tag) return job.tag.toLowerCase()
  if (job.categoria) return job.categoria.toLowerCase()
  if (job.category) return job.category.toLowerCase()

  // Tenta extrair do título (heurística simples)
  const title = (job.title || job.job_title || "").toLowerCase()
  const stacks = [
    "react",
    "angular",
    "vue",
    "node",
    "python",
    "java",
    "go",
    "rust",
    "mobile",
    "ios",
    "android",
    "flutter",
    "devops",
    "data",
    "backend",
    "frontend",
    "fullstack",
    "php",
    "ruby",
    ".net",
    "c#",
    "kotlin",
    "swift"
  ]
  for (const stack of stacks) {
    if (title.includes(stack)) return stack
  }

  return "other"
}

/**
 * Filtra vagas removendo as já enviadas (cooldown).
 * @param {object[]} jobs
 * @param {Set<string>} sentIds - IDs já enviados
 * @returns {object[]}
 */
export function filterSentJobs(jobs, sentIds) {
  return jobs.filter((job) => {
    const id = job.id || job.url || job.job_url
    return !sentIds.has(id)
  })
}

/**
 * Seleciona vagas garantindo diversidade de stacks.
 * No máximo `maxConsecutive` vagas da mesma stack em sequência.
 * @param {object[]} shuffledJobs - Vagas já embaralhadas
 * @param {number} count - Quantidade desejada
 * @param {number} [maxConsecutive=2] - Máximo de consecutivas da mesma stack
 * @returns {object[]}
 */
export function selectWithDiversity(shuffledJobs, count, maxConsecutive = 2) {
  if (shuffledJobs.length === 0) return []
  if (count <= 0) return []

  const selected = []
  const remaining = [...shuffledJobs]

  while (selected.length < count && remaining.length > 0) {
    // Conta quantas consecutivas da última stack temos
    let lastStack = null
    let consecutiveCount = 0

    if (selected.length > 0) {
      lastStack = extractStack(selected[selected.length - 1])
      consecutiveCount = 1
      for (let i = selected.length - 2; i >= 0; i--) {
        if (extractStack(selected[i]) === lastStack) {
          consecutiveCount++
        } else {
          break
        }
      }
    }

    // Se atingiu o máximo de consecutivas, tenta encontrar uma de outra stack
    let candidateIndex = 0
    if (consecutiveCount >= maxConsecutive && lastStack) {
      const differentStackIndex = remaining.findIndex((job) => extractStack(job) !== lastStack)
      if (differentStackIndex !== -1) {
        candidateIndex = differentStackIndex
      }
    }

    selected.push(remaining[candidateIndex])
    remaining.splice(candidateIndex, 1)
  }

  return selected
}

/**
 * Seleciona N vagas aleatórias com distribuição justa.
 * @param {object} options
 * @param {object[]} options.jobs - Lista de vagas disponíveis
 * @param {string} options.groupId - ID do grupo (para seed)
 * @param {number} options.count - Quantidade de vagas a selecionar
 * @param {Set<string>} [options.sentIds] - IDs já enviados (para cooldown)
 * @param {number} [options.maxConsecutive=2] - Máximo de vagas consecutivas da mesma stack
 * @param {boolean} [options.useSeed=true] - Usar seed determinística
 * @returns {object[]}
 */
export function selectRandomJobs({
  jobs,
  groupId,
  count,
  sentIds = new Set(),
  maxConsecutive = 2,
  useSeed = true
}) {
  // 1. Filtra vagas já enviadas
  const available = filterSentJobs(jobs, sentIds)

  if (available.length === 0) return []

  // 2. Cria RNG (com ou sem seed)
  const rng = useSeed ? seededRng(generateSeed(groupId)) : Math.random

  // 3. Embaralha com Fisher-Yates
  const shuffled = shuffle(available, rng)

  // 4. Seleciona com diversidade de stacks
  return selectWithDiversity(shuffled, count, maxConsecutive)
}

/**
 * Seleciona a próxima vaga a enviar (caso de envio unitário).
 * @param {object} options
 * @param {object[]} options.jobs
 * @param {string} options.groupId
 * @param {Set<string>} [options.sentIds]
 * @param {string[]} [options.recentStacks] - Últimas stacks enviadas (para diversidade)
 * @param {number} [options.maxConsecutive=2]
 * @returns {object|null}
 */
export function selectNextJob({ jobs, groupId, sentIds = new Set(), recentStacks = [], maxConsecutive = 2 }) {
  const available = filterSentJobs(jobs, sentIds)
  if (available.length === 0) return null

  const rng = seededRng(generateSeed(groupId))
  const shuffled = shuffle(available, rng)

  // Conta consecutivas da última stack
  let lastStack = recentStacks[recentStacks.length - 1] || null
  let consecutiveCount = 0
  if (lastStack) {
    for (let i = recentStacks.length - 1; i >= 0; i--) {
      if (recentStacks[i] === lastStack) consecutiveCount++
      else break
    }
  }

  // Se atingiu máximo, tenta uma de outra stack
  if (consecutiveCount >= maxConsecutive && lastStack) {
    const different = shuffled.find((job) => extractStack(job) !== lastStack)
    if (different) return different
  }

  return shuffled[0] || null
}
