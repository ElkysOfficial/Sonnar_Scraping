/**
 * Validadores de CPF e Email usando algoritmos matemáticos
 * Sem dependência de APIs externas
 */

/**
 * Valida um CPF usando o algoritmo oficial da Receita Federal
 * O CPF tem 11 dígitos, sendo os 2 últimos dígitos verificadores
 *
 * Algoritmo:
 * 1. Multiplica os 9 primeiros dígitos por 10, 9, 8, 7, 6, 5, 4, 3, 2
 * 2. Soma os resultados e calcula o resto da divisão por 11
 * 3. Se resto < 2, primeiro dígito = 0, senão = 11 - resto
 * 4. Repete com os 10 primeiros dígitos (multiplicando por 11, 10, 9...)
 *
 * @param {string} cpf - CPF a ser validado (pode conter formatação)
 * @returns {boolean} - true se válido, false se inválido
 */
export function validateCPF(cpf) {
  // Remove caracteres não numéricos
  const cleanCPF = String(cpf).replace(/\D/g, '')

  // Verifica se tem 11 dígitos
  if (cleanCPF.length !== 11) {
    return false
  }

  // Verifica se todos os dígitos são iguais (CPFs inválidos conhecidos)
  if (/^(\d)\1{10}$/.test(cleanCPF)) {
    return false
  }

  // Calcula o primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleanCPF[9])) {
    return false
  }

  // Calcula o segundo dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleanCPF[10])) {
    return false
  }

  return true
}

/**
 * Valida um CNPJ usando o algoritmo oficial da Receita Federal
 * O CNPJ tem 14 dígitos, sendo os 2 últimos dígitos verificadores
 *
 * @param {string} cnpj - CNPJ a ser validado (pode conter formatação)
 * @returns {boolean} - true se válido, false se inválido
 */
export function validateCNPJ(cnpj) {
  // Remove caracteres não numéricos
  const cleanCNPJ = String(cnpj).replace(/\D/g, '')

  // Verifica se tem 14 dígitos
  if (cleanCNPJ.length !== 14) {
    return false
  }

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) {
    return false
  }

  // Pesos para o primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  // Pesos para o segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  // Calcula o primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleanCNPJ[i]) * weights1[i]
  }
  let remainder = sum % 11
  const digit1 = remainder < 2 ? 0 : 11 - remainder

  if (digit1 !== parseInt(cleanCNPJ[12])) {
    return false
  }

  // Calcula o segundo dígito verificador
  sum = 0
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleanCNPJ[i]) * weights2[i]
  }
  remainder = sum % 11
  const digit2 = remainder < 2 ? 0 : 11 - remainder

  if (digit2 !== parseInt(cleanCNPJ[13])) {
    return false
  }

  return true
}

/**
 * Valida um email usando expressão regular
 * Verifica formato básico e estrutura do email
 *
 * Regras:
 * - Deve ter um @ separando local e domínio
 * - Parte local pode ter letras, números e caracteres especiais (._%+-)
 * - Domínio deve ter pelo menos um ponto
 * - TLD deve ter pelo menos 2 caracteres
 *
 * @param {string} email - Email a ser validado
 * @returns {boolean} - true se válido, false se inválido
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false
  }

  const trimmedEmail = email.trim().toLowerCase()

  // Verifica comprimento mínimo e máximo
  if (trimmedEmail.length < 5 || trimmedEmail.length > 254) {
    return false
  }

  // Regex para validação de email (RFC 5322 simplificado)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

  if (!emailRegex.test(trimmedEmail)) {
    return false
  }

  // Verifica se não começa ou termina com ponto na parte local
  const [localPart, domain] = trimmedEmail.split('@')

  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false
  }

  // Verifica pontos consecutivos
  if (localPart.includes('..') || domain.includes('..')) {
    return false
  }

  // Verifica se o TLD tem pelo menos 2 caracteres
  const tld = domain.split('.').pop()
  if (tld.length < 2) {
    return false
  }

  return true
}

/**
 * Verifica se um email tem domínio comum/conhecido
 * Útil para alertar sobre possíveis erros de digitação
 *
 * @param {string} email - Email a ser verificado
 * @returns {{ valid: boolean, suggestion?: string }} - Resultado com possível sugestão
 */
export function checkEmailDomain(email) {
  if (!validateEmail(email)) {
    return { valid: false }
  }

  const domain = email.split('@')[1].toLowerCase()

  // Domínios comuns e suas variações com erros de digitação
  const commonDomains = {
    'gmail.com': ['gmai.com', 'gmial.com', 'gamil.com', 'gmail.con', 'gmail.co', 'gmaill.com'],
    'hotmail.com': ['hotmal.com', 'hotmai.com', 'hotmail.con', 'hotamil.com', 'hotmial.com'],
    'outlook.com': ['outloo.com', 'outlok.com', 'outlook.con', 'outllook.com'],
    'yahoo.com': ['yaho.com', 'yahoo.con', 'yahooo.com', 'yhoo.com'],
    'icloud.com': ['iclou.com', 'icoud.com', 'icloud.con'],
    'live.com': ['liv.com', 'live.con'],
    'uol.com.br': ['uol.com', 'uol.con.br', 'oul.com.br'],
    'bol.com.br': ['bol.com', 'bol.con.br'],
    'terra.com.br': ['terra.com', 'tera.com.br'],
    'globo.com': ['globo.con', 'gloobo.com']
  }

  // Verifica se é um domínio comum
  if (Object.keys(commonDomains).includes(domain)) {
    return { valid: true }
  }

  // Verifica se parece um erro de digitação
  for (const [correct, typos] of Object.entries(commonDomains)) {
    if (typos.includes(domain)) {
      return {
        valid: true,
        suggestion: email.replace(domain, correct)
      }
    }
  }

  return { valid: true }
}

/**
 * Formata CPF para exibição (XXX.XXX.XXX-XX)
 * @param {string} cpf - CPF sem formatação
 * @returns {string} - CPF formatado
 */
export function formatCPF(cpf) {
  const clean = String(cpf).replace(/\D/g, '')
  if (clean.length !== 11) return cpf
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/**
 * Formata CNPJ para exibição (XX.XXX.XXX/XXXX-XX)
 * @param {string} cnpj - CNPJ sem formatação
 * @returns {string} - CNPJ formatado
 */
export function formatCNPJ(cnpj) {
  const clean = String(cnpj).replace(/\D/g, '')
  if (clean.length !== 14) return cnpj
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

/**
 * Valida formato de CEP brasileiro.
 * Aceita formatado ou só dígitos. Não valida existência (use ViaCEP pra isso).
 *
 * @param {string} cep - CEP a ser validado
 * @returns {boolean} - true se tem 8 dígitos, false caso contrário
 */
export function validateCEP(cep) {
  const clean = String(cep ?? '').replace(/\D/g, '')
  return clean.length === 8
}

/**
 * Formata CEP para exibição (XXXXX-XXX).
 *
 * @param {string} cep - CEP sem formatação
 * @returns {string} - CEP formatado, ou o input original se não tiver 8 dígitos
 */
export function formatCEP(cep) {
  const clean = String(cep ?? '').replace(/\D/g, '')
  if (clean.length !== 8) return cep
  return clean.replace(/(\d{5})(\d{3})/, '$1-$2')
}

/**
 * Valida uma senha verificando se atende a todos os requisitos de segurança
 * 
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra maiúscula (A-Z)
 * - Pelo menos 1 letra minúscula (a-z)
 * - Pelo menos 1 número (0-9)
 * - Pelo menos 1 caractere especial (!@#$%^&*(),.?":{}|<>)
 *
 * @param {string} password - Senha a ser validada
 * @returns {{ isValid: boolean, rules: { minLength: boolean, hasUppercase: boolean, hasLowercase: boolean, hasNumber: boolean, hasSpecial: boolean } }}
 */
export function validatePassword(password) {
  const pwd = password || ''
  const rules = {
    minLength: pwd.length >= 8,
    hasUppercase: /[A-Z]/.test(pwd),
    hasLowercase: /[a-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
  }
  
  return {
    isValid: Object.values(rules).every(Boolean),
    rules
  }
}
