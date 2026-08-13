/**
 * AdminWorkspace — top-level admin section identifier.
 *
 * Defined here (not in a concrete layout) so editor chrome (e.g. Toolbar)
 * can reference the type without creating cycles through layout modules.
 *
 * THREE destinations, matching `docs/architecture/admin-store.md`: Site owns
 * presentation, Commerce owns catalogue data, Media owns uploads. Instatic's
 * other workspaces (dashboard, content, data, plugins, users, ai, account)
 * were removed — they had no Ruby API behind them, and `AuthenticatedAdmin`
 * silently rendered the Site editor for every one of them.
 */
export type AdminWorkspace =
  | 'site'
  | 'media'
  | 'commerce'
