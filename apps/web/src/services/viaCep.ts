/**
 * Cliente do ViaCEP - autopreenchimento de endereco a partir do CEP.
 *
 * API publica gratuita (sem auth, sem CORS issues): https://viacep.com.br/.
 * Retorna `null` quando o CEP eh invalido, inexistente ou a chamada falha
 * (timeout, offline). O frontend usa esse `null` como sinal pra deixar os
 * campos editaveis em vez de bloquear o usuario.
 */

export interface ViaCepAddress {
  /** Logradouro (rua/avenida). */
  street: string
  /** Bairro. */
  neighborhood: string
  /** Cidade. */
  city: string
  /** UF (sigla de 2 letras). */
  state: string
}

/**
 * Resposta crua do ViaCEP. Documentada em https://viacep.com.br/.
 * `erro: true` aparece quando o CEP nao existe na base.
 */
interface ViaCepResponse {
  cep?: string
  logradouro?: string
  complemento?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean
}

/** Tempo maximo de espera pra resposta do ViaCEP. */
const VIACEP_TIMEOUT_MS = 5_000

/**
 * Busca um CEP no ViaCEP e devolve o endereco normalizado.
 *
 * @param cep CEP em qualquer formato (so digitos ou com mascara `00000-000`).
 * @returns Endereco preenchido, ou `null` se invalido/inexistente/falha.
 */
export async function fetchCEP(cep: string): Promise<ViaCepAddress | null> {
  const clean = String(cep ?? '').replace(/\D/g, '')
  if (clean.length !== 8) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS)

  try {
    const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      signal: controller.signal,
    })
    if (!response.ok) return null

    const data = (await response.json()) as ViaCepResponse
    if (data.erro) return null

    return {
      street: data.logradouro?.trim() ?? '',
      neighborhood: data.bairro?.trim() ?? '',
      city: data.localidade?.trim() ?? '',
      state: data.uf?.trim().toUpperCase() ?? '',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
