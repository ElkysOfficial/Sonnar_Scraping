import { describe, it, expect } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  describe('aceita paths internos válidos', () => {
    it.each([
      '/',
      '/dashboard',
      '/dashboard/vagas',
      '/dashboard/configuracoes?aba=perfil',
      '/admin/subscribers#topo',
      '/cadastro/pro',
      '/path/with-dash_and.dot~tilde'
    ])('aceita %s', (input) => {
      expect(safeRedirect(input)).toBe(input)
    })
  })

  describe('bloqueia URLs absolutas e schemes perigosos', () => {
    it.each([
      'https://evil.com',
      'http://evil.com/dashboard',
      'mailto:user@example.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'tel:+5511999999999',
      'file:///etc/passwd',
      'ftp://evil.com'
    ])('rejeita %s', (input) => {
      expect(safeRedirect(input)).toBeNull()
    })
  })

  describe('bloqueia protocol-relative', () => {
    it.each([
      '//evil.com',
      '//evil.com/dashboard',
      '////triple'
    ])('rejeita %s', (input) => {
      expect(safeRedirect(input)).toBeNull()
    })
  })

  describe('bloqueia backslash injection', () => {
    it.each([
      '/\\evil.com',
      '/dashboard\\..\\admin',
      '\\dashboard',
      '/path\\with\\back'
    ])('rejeita %s', (input) => {
      expect(safeRedirect(input)).toBeNull()
    })
  })

  describe('bloqueia control characters', () => {
    it('rejeita CR/LF', () => {
      expect(safeRedirect('/dashboard\r\nLocation: https://evil.com')).toBeNull()
      expect(safeRedirect('/dashboard\nfoo')).toBeNull()
      expect(safeRedirect('/dashboard\rfoo')).toBeNull()
    })
    it('rejeita NUL', () => {
      expect(safeRedirect('/dashboard\x00')).toBeNull()
    })
    it('rejeita TAB', () => {
      expect(safeRedirect('/dash\tboard')).toBeNull()
    })
    it('rejeita DEL (\\x7F)', () => {
      expect(safeRedirect('/dash\x7fboard')).toBeNull()
    })
    it('rejeita whitespace no início', () => {
      expect(safeRedirect(' /dashboard')).toBeNull()
      expect(safeRedirect('\t/dashboard')).toBeNull()
    })
  })

  describe('bloqueia entrada inválida', () => {
    it.each([
      [''],
      [null],
      [undefined],
      [123],
      [true],
      [{ path: '/dashboard' }],
      [['/dashboard']]
    ])('rejeita %p', (input) => {
      expect(safeRedirect(input)).toBeNull()
    })
  })

  describe('aceita query params e fragments', () => {
    it('preserva query string', () => {
      expect(safeRedirect('/dashboard?upgrade=success')).toBe('/dashboard?upgrade=success')
    })
    it('preserva fragment', () => {
      expect(safeRedirect('/termos#cookies')).toBe('/termos#cookies')
    })
    it('preserva ambos', () => {
      expect(safeRedirect('/x?a=1&b=2#section')).toBe('/x?a=1&b=2#section')
    })
  })
})
