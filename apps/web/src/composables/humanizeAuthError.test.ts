import { describe, it, expect } from 'vitest'
import { humanizeAuthError } from './useAuth'

describe('humanizeAuthError', () => {
  describe('mapeia erros conhecidos do Supabase', () => {
    it.each([
      ['Invalid login credentials', 'E-mail ou senha incorretos.'],
      ['invalid_credentials', 'E-mail ou senha incorretos.'],
      ['INVALID LOGIN CREDENTIALS', 'E-mail ou senha incorretos.'],
      ['Email not confirmed', 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'],
      ['Too many requests', 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.'],
      ['Rate limit exceeded for endpoint', 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.'],
      ['User not found', 'Não encontramos uma conta com esse e-mail.'],
      ['Network error: timeout', 'Sem conexão com o servidor. Verifique sua internet.'],
      ['Failed to fetch', 'Sem conexão com o servidor. Verifique sua internet.']
    ])('mapeia "%s"', (input, expected) => {
      expect(humanizeAuthError(input)).toBe(expected)
    })
  })

  describe('é case-insensitive', () => {
    it.each([
      'Invalid Login Credentials',
      'INVALID LOGIN CREDENTIALS',
      'invalid login credentials',
      'iNvAlId LoGiN cReDeNtIaLs'
    ])('reconhece "%s"', (input) => {
      expect(humanizeAuthError(input)).toBe('E-mail ou senha incorretos.')
    })
  })

  describe('cai no fallback genérico para erros desconhecidos', () => {
    it.each([
      '',
      'Some unexpected supabase error',
      'JSON parse error at column 5',
      'Unique constraint violated',
      '500 Internal Server Error'
    ])('retorna fallback para "%s"', (input) => {
      expect(humanizeAuthError(input)).toBe('Não foi possível concluir a operação. Tente novamente.')
    })
  })

  describe('nunca retorna a string original do erro', () => {
    it('não vaza detalhes técnicos no fallback', () => {
      const technical = 'PGRST116: JWT expired at jti=abc-123'
      const result = humanizeAuthError(technical)
      expect(result).not.toContain('PGRST')
      expect(result).not.toContain('JWT')
      expect(result).not.toContain('jti')
    })
  })
})
