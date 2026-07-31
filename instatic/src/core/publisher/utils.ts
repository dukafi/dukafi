/**
 * Canonical HTML-escape, URL-validation, and CSS-sanitisation utilities.
 *
 * This is the single source of truth for all escaping/sanitisation in the
 * publisher pipeline. Both the publisher (render.ts), base modules
 * (modules/base/utils/escape.ts), and editor components
 * (ClassStyleInjector.tsx) import from here — no duplicate implementations.
 *
 * Constraint #211 contract:
 *   - escapeHtml() is called by the publisher via escapeProps() BEFORE render().
 *   - Module render() functions receive pre-escaped string props and MUST NOT
 *     call escapeHtml() on those props again (that causes double-escaping: CWE-116).
 *   - URL props (href/src/etc.) are an exception: the publisher validates safety via
 *     isSafeUrl() but does NOT HTML-escape them. Module render() functions must
 *     call safeUrl() on URL props (validation + HTML-escape in one step).
 *   - Values a module constructs INTERNALLY (not from props) may still call escapeHtml().
 *
 * Constraint #228 contract:
 *   - sanitiseCssValue() is the canonical CSS value sanitiser. Both ClassStyleInjector
 *     (editor live preview) and buildStyle() (module CSS) must use this function — no
 *     per-file reimplementations (same pattern that fixed CWE-116 for HTML escaping).
 */

// HTML and URL helpers live in the dependency-free `@core/html-sanitize` leaf.
// Re-exported here so publisher-side consumers can keep importing from the
// publisher barrel without making markdown/template code depend on the full
// publisher graph.
export { escapeHtml, isSafeUrl, safeUrl } from '@core/html-sanitize'

// ---------------------------------------------------------------------------
// CSS value sanitisation
// ---------------------------------------------------------------------------

// The canonical `sanitiseCssValue` now lives in the dependency-free
// `@core/css-sanitize` leaf so the framework engine can share it without a
// framework→publisher cycle. Re-exported here so publisher-side consumers
// (classCss, base modules, editor canvas) keep importing it from
// `@core/publisher` unchanged. See `@core/css-sanitize` for the full doc.
export { sanitiseCssValue } from '@core/css-sanitize'
