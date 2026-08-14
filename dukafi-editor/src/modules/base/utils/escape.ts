/**
 * Escape utilities for base module render() functions.
 *
 * Constraint #211 — escaping contract:
 *   The publisher calls escapeProps() on ALL props BEFORE invoking module render().
 *   This means plain string props (text, label, color, fontFamily, etc.) arrive
 *   pre-HTML-escaped. Module render() functions MUST NOT call escapeHtml() on
 *   those props — doing so causes double-escaping (CWE-116): "&" → "&amp;amp;".
 *
 *   URL props are the exception: the publisher validates safety via isSafeUrl() but
 *   does NOT HTML-escape them. Module render() functions MUST call safeUrl() on
 *   URL props (href, src, action, etc.) to produce a single, correctly escaped value.
 *
 *   Use escapeHtml() only for strings the module constructs INTERNALLY (not from props).
 *
 * Canonical implementations live in src/core/publisher/utils — imported here to
 * guarantee a single implementation with zero divergence risk (same pattern that
 * fixed CWE-116 double-escaping in Contribution #393).
 */

// Import and re-export canonical implementations — do not reimplement locally.
// sanitiseCssValue is the canonical CSS injection sanitiser (Constraint #228).
// Using import+re-export (not just `export { } from`) so the symbols are also
// available as local bindings within this file (e.g. used by buildStyle below).
import { escapeHtml, safeUrl, sanitiseCssValue } from '@core/publisher'
export { escapeHtml, safeUrl, sanitiseCssValue }

// ---------------------------------------------------------------------------
// CSS helpers (module-specific, not shared with publisher)
// ---------------------------------------------------------------------------

/**
 * Build a CSS `style=""` attribute string from a partial style record.
 * Skips undefined/null/empty-string values.
 * Applies CSS injection sanitisation via the canonical sanitiseCssValue().
 *
 * Values placed here arrive pre-HTML-escaped from the publisher (Constraint #211).
 * This function adds a second layer of CSS-specific sanitisation to block
 * CSS expression injection and similar vectors (Constraint #228).
 */
export function buildStyle(styles: Record<string, string | number | undefined | null>): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .flatMap(([k, v]) => {
      const sanitised = sanitiseCssValue(v as string | number)
      if (sanitised === null) return []  // drop dangerous values
      // Convert camelCase to kebab-case
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      return [`${prop}:${sanitised}`]
    })
    .join(';')
}
