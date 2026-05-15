/**
 * Sanitiza um path interno usado em fluxos de redirect (ex.: `?redirect=`
 * pós-login). Anti open-redirect e anti header-injection.
 *
 * Aceita apenas paths absolutos da própria origem (começam com `/` simples).
 *
 * Bloqueia:
 *   - URLs absolutas (`https://evil.com`, `mailto:`, `javascript:`, `data:`)
 *   - Protocol-relative (`//evil.com`)
 *   - Backslash injection (`/\evil.com` - alguns browsers normalizam pra `//evil.com`)
 *   - Control chars (codepoints < U+0020) - defesa contra header/log injection
 *     e contra bypasses que usam `\r`, `\n`, `\t` no meio do path
 *   - Whitespace no início (browsers podem trimar e bypassar a checagem)
 *   - Strings vazias ou não-string
 *
 * Retorna `null` se inválido - o caller decide o fallback (geralmente `/`).
 *
 * @param raw   o valor cru (vindo de query param, sessionStorage, etc.)
 * @returns     path validado seguro pra `router.replace()` ou `null`
 */
export function safeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null

  // Whitespace no início é bypass clássico em alguns parsers.
  if (raw[0] !== '/') return null

  // Protocol-relative (`//host`) seria carregado como cross-origin pelo browser.
  if (raw.startsWith('//')) return null

  // Backslash em qualquer posição. Alguns browsers (legados) tratam `\` como `/`,
  // então `/\evil.com` pode virar `//evil.com` na resolução de URL.
  if (raw.includes('\\')) return null

  // Control characters (\x00–\x1F + \x7F). Cobrem CR/LF/TAB/NUL e demais
  // não-imprimíveis. Defesa contra log injection e parsers permissivos.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return null
  }

  return raw
}
