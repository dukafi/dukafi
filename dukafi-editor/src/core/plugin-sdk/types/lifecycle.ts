// ---------------------------------------------------------------------------
// Lifecycle hooks, migration context, and lifecycle status
// ---------------------------------------------------------------------------

export type ServerPluginLifecycleHook =
  | 'install'
  | 'activate'
  | 'deactivate'
  | 'uninstall'
  | 'migrate'

export const SERVER_PLUGIN_LIFECYCLE_HOOKS: ServerPluginLifecycleHook[] = [
  'install',
  'activate',
  'deactivate',
  'uninstall',
  'migrate',
]

/**
 * Context passed to the `migrate` hook. Plugins receive the previous
 * version's manifest version string so they can write conditional migrations
 * (e.g. "if fromVersion < 1.2.0, run X"). The new version's `migrate` is the
 * one that runs — it knows the new schema and is responsible for transforming
 * data stored under the old shape.
 *
 * Order during an upgrade:
 *   1. Old version's `deactivate(api)` (if running)
 *   2. New version's assets land on disk
 *   3. New version's `migrate({ fromVersion }, api)` — this hook
 *   4. New version's `activate(api)`
 *
 * If `migrate` throws, the host rolls back to the previous version's assets
 * and re-activates the previous version. If `activate` throws after a
 * successful migrate, ALSO rolls back — at that point migrate has typically
 * mutated stored data, so plugins SHOULD treat their migrations as
 * idempotent on the next attempt.
 */
export interface PluginMigrationContext {
  fromVersion: string
}

export type PluginLifecycleStatus = 'installed' | 'active' | 'disabled' | 'error'
