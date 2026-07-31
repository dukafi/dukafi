/**
 * Font token string helpers.
 *
 * Pure string normalization/sanitization used by both persisted font schemas
 * and runtime token resolution. Kept separate from `tokens.ts` so schema
 * parsing never imports the domain helpers that depend on schema-derived types.
 */

export function normalizeFontTokenVariable(raw: string): string {
  const normalized = raw
    .trim()
    .replace(/^-+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) return ''
  return normalized.startsWith('font-') ? normalized : `font-${normalized}`
}

export function fontTokenCssVariable(variable: string): string {
  const normalized = normalizeFontTokenVariable(variable)
  return normalized ? `--${normalized}` : ''
}

export function fontTokenValueExpr(variable: string): string {
  const cssVariable = fontTokenCssVariable(variable)
  return cssVariable ? `var(${cssVariable})` : ''
}

export function suggestFontTokenVariable(label: string): string {
  return normalizeFontTokenVariable(label || 'font')
}

export function sanitizeFontFallbackStack(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .split(',')
    .map((part) => part.trim().replace(/["\\\n\r<>;{}]/g, ''))
    .filter((part) => part.length > 0)
  if (cleaned.length === 0) return 'sans-serif'
  return cleaned.join(', ')
}
