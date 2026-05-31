/**
 * matchCalculator (v3.10.31)
 *
 * Calcula o match entre uma vaga e o curriculo/perfil do assinante.
 * Devolve score 0-100 + breakdown estruturado (pontos fortes e gaps).
 *
 * Importante: o score numerico fica SOMENTE para uso interno (dashboard).
 * No WhatsApp, mostramos apenas as listas "strong" e "gaps" para nao
 * desmotivar o candidato.
 *
 * Pesos das dimensoes (total 100):
 *   - hard skills      40
 *   - anos             15
 *   - senioridade      15
 *   - soft skills      10
 *   - atividades       10
 *   - idiomas           5
 *   - setor             5
 */

import {
  extractJobRequirements,
  compareSeniority,
  extractSoftSkills,
  extractKeyActivities,
  extractLanguagesRequired,
  extractIndustry,
  SOFT_SKILL_LABEL,
  LANGUAGE_LABEL,
  INDUSTRY_LABEL,
} from "./jobRequirementsParser.js"

const WEIGHTS = {
  hardSkills: 40,
  years: 15,
  seniority: 15,
  softSkills: 10,
  activities: 10,
  languages: 5,
  industry: 5,
}

const norm = (s) => String(s || "").toLowerCase().trim()

function toSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map(norm).filter(Boolean))
}

/**
 * Calcula match completo.
 *
 * @param {object} jobData - normalizado (de textBuilder.extractJobDataFromEmbed)
 * @param {object} resume - { skills[], yearsTotal, seniority, softSkills[],
 *                            languages[], industries[], activities[] }
 * @returns {{
 *   score: number,
 *   strong: string[],
 *   gaps: string[],
 *   dimensions: object,
 * }}
 */
export function calculateMatch(jobData, resume) {
  const strong = []
  const gaps = []
  const dim = {}

  if (!resume) {
    return { score: 0, strong, gaps, dimensions: dim }
  }

  // Concatena texto que vai ser passado pros extractors da vaga
  const jobText = [
    jobData?.title,
    jobData?.description,
    jobData?.responsibilities,
  ].filter(Boolean).join("\n")

  // ── Hard skills ──
  const jobSkills = Array.isArray(jobData?.skills) ? jobData.skills : []
  const resumeSkillSet = toSet(resume.skills)
  if (jobSkills.length > 0 && resumeSkillSet.size > 0) {
    const matched = jobSkills.filter((s) => resumeSkillSet.has(norm(s)))
    const pct = jobSkills.length > 0 ? matched.length / jobSkills.length : 0
    dim.hardSkills = Math.round(pct * 100)
    if (matched.length > 0) {
      strong.push(`${matched.length} de ${jobSkills.length} skills batem (${matched.slice(0, 4).join(", ")})`)
    }
    const missing = jobSkills.filter((s) => !resumeSkillSet.has(norm(s)))
    if (missing.length > 0 && missing.length <= 4) {
      gaps.push(`Faltam: ${missing.join(", ")}`)
    } else if (missing.length > 4) {
      gaps.push(`Faltam ${missing.length} skills (ex.: ${missing.slice(0, 3).join(", ")})`)
    }
  } else {
    dim.hardSkills = null
  }

  // ── Anos ──
  const reqs = extractJobRequirements(jobData || {})
  if (reqs.yearsRequired != null && resume.yearsTotal != null) {
    if (resume.yearsTotal >= reqs.yearsRequired) {
      dim.years = 100
      strong.push(`${resume.yearsTotal} anos de experiência (vaga pede ${reqs.yearsRequired}+)`)
    } else {
      const ratio = resume.yearsTotal / reqs.yearsRequired
      dim.years = Math.round(ratio * 100)
      const gap = reqs.yearsRequired - resume.yearsTotal
      gaps.push(`Vaga pede ${reqs.yearsRequired}+ anos — você tem ~${resume.yearsTotal} (gap de ${gap})`)
    }
  } else {
    dim.years = null
  }

  // ── Senioridade ──
  if (reqs.seniorityRequired && resume.seniority) {
    const cmp = compareSeniority(resume.seniority, reqs.seniorityRequired)
    if (cmp === "match" || cmp === "over") {
      dim.seniority = 100
      if (cmp === "match") {
        strong.push(`Senioridade ${resume.seniority} bate com a vaga`)
      } else {
        strong.push(`Você é ${resume.seniority} — vaga pede ${reqs.seniorityRequired}`)
      }
    } else {
      dim.seniority = 50
      gaps.push(`Vaga é ${reqs.seniorityRequired} — seu nível indica ${resume.seniority}`)
    }
  } else {
    dim.seniority = null
  }

  // ── Soft skills ──
  const jobSofts = extractSoftSkills(jobText)
  const resumeSofts = toSet(resume.softSkills)
  if (jobSofts.length > 0) {
    if (resumeSofts.size > 0) {
      const matched = jobSofts.filter((k) => resumeSofts.has(k))
      const pct = matched.length / jobSofts.length
      dim.softSkills = Math.round(pct * 100)
      if (matched.length > 0) {
        const labels = matched.map((k) => SOFT_SKILL_LABEL[k] || k).slice(0, 3)
        strong.push(`Soft skills alinhadas: ${labels.join(", ")}`)
      }
      const missing = jobSofts.filter((k) => !resumeSofts.has(k))
      if (missing.length > 0) {
        const labels = missing.map((k) => SOFT_SKILL_LABEL[k] || k).slice(0, 3)
        gaps.push(`Reforce no CV: ${labels.join(", ")}`)
      }
    } else {
      dim.softSkills = 0
      const labels = jobSofts.map((k) => SOFT_SKILL_LABEL[k] || k).slice(0, 3)
      gaps.push(`Vaga pede ${labels.join(", ")} — destaque no CV`)
    }
  } else {
    dim.softSkills = null
  }

  // ── Atividades ──
  const jobActs = extractKeyActivities(jobText)
  const resumeActs = toSet(resume.activities)
  if (jobActs.length > 0 && resumeActs.size > 0) {
    const matched = jobActs.filter((a) => resumeActs.has(a))
    const pct = jobActs.length > 0 ? matched.length / jobActs.length : 0
    dim.activities = Math.round(pct * 100)
    if (matched.length >= 2) {
      strong.push(`Já fez atividades parecidas (${matched.slice(0, 3).join(", ")})`)
    }
  } else {
    dim.activities = null
  }

  // ── Idiomas ──
  const jobLangs = extractLanguagesRequired(jobText)
  const resumeLangs = toSet(resume.languages)
  if (jobLangs.length > 0) {
    if (resumeLangs.size > 0) {
      const matched = jobLangs.filter((l) => {
        // resume guarda 'ingles avancado', 'ingles', etc — match parcial
        return Array.from(resumeLangs).some((r) => r.includes(l.replace(/_.*/, "")))
      })
      const pct = matched.length / jobLangs.length
      dim.languages = Math.round(pct * 100)
      if (matched.length === jobLangs.length) {
        strong.push("Atende aos idiomas exigidos")
      } else {
        const missing = jobLangs.filter((l) => !matched.includes(l))
        const labels = missing.map((k) => LANGUAGE_LABEL[k] || k)
        gaps.push(`Idioma exigido: ${labels.join(", ")}`)
      }
    } else {
      dim.languages = 0
      const labels = jobLangs.map((k) => LANGUAGE_LABEL[k] || k)
      gaps.push(`Idioma exigido: ${labels.join(", ")}`)
    }
  } else {
    dim.languages = null
  }

  // ── Setor ──
  const jobIndustry = extractIndustry(jobText)
  const resumeIndustries = toSet(resume.industries)
  if (jobIndustry) {
    if (resumeIndustries.has(jobIndustry)) {
      dim.industry = 100
      strong.push(`Experiência no setor ${INDUSTRY_LABEL[jobIndustry] || jobIndustry}`)
    } else {
      dim.industry = 0
    }
  } else {
    dim.industry = null
  }

  // ── Score final (pondera somente dimensoes com dado) ──
  let totalWeight = 0
  let weightedSum = 0
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const value = dim[key]
    if (value == null) continue
    totalWeight += weight
    weightedSum += (value * weight) / 100
  }
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0

  return { score, strong, gaps, dimensions: dim }
}

export const MATCH_WEIGHTS = WEIGHTS
