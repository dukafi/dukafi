/**
 * Root-scope selector helpers shared by import token extractors.
 */

/** Selectors whose custom properties define document-wide tokens. */
const ROOT_SCOPE_SELECTORS = new Set([':root', 'html', 'body'])

/**
 * A selector that targets only the document root: `:root`, `html`, `body`, or a
 * comma group of those. Compound/qualified selectors (`:root.theme-alt`) are
 * not root scope and keep their vars.
 */
export function isRootScopeSelector(selector: string): boolean {
  const parts = selector.split(',').map((p) => p.trim().toLowerCase())
  return parts.length > 0 && parts.every((p) => ROOT_SCOPE_SELECTORS.has(p))
}
