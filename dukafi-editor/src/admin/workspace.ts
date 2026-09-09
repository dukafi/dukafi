/**
 * AdminWorkspace — top-level admin section identifier.
 *
 * Defined here (not in a concrete layout) so editor chrome (e.g. Toolbar)
 * can reference the type without creating cycles through layout modules.
 *
 * THREE destinations, matching `docs/architecture/admin-store.md`: the Editor
 * owns presentation, Commerce owns catalogue data, Media owns uploads.
 * Instatic's other workspaces (dashboard, content, data, plugins, users, ai,
 * account) were removed — they had no Ruby API behind them, and
 * `AuthenticatedAdmin` silently rendered the editor for every one of them.
 *
 * The canvas workspace id stays `'site'` (capabilities, store, APIs). The
 * public URL and sidebar label are Editor (`/admin/editor`).
 */
export type AdminWorkspace =
  | 'site'
  | 'media'
  | 'dashboard'

/** Public path for the visual editor. Internal workspace id remains `'site'`. */
export const SITE_EDITOR_PATH = '/admin/editor'

const LEGACY_SITE_EDITOR_PATH = '/admin/site'

export function isSiteEditorPath(pathname: string): boolean {
  return isExactOrChildPath(pathname, SITE_EDITOR_PATH)
    || isExactOrChildPath(pathname, LEGACY_SITE_EDITOR_PATH)
}

function isExactOrChildPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}
