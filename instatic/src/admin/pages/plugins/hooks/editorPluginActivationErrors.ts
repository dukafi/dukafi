/**
 * Editor-side plugin activation error store.
 *
 * Server-side lifecycle errors land in `InstalledPlugin.lastError` and are
 * surfaced via the existing `<p className={styles.pluginError}>` line on the
 * plugin card. Editor-side activation failures (the plugin's editor
 * entrypoint or module pack throws when imported into the browser) had no
 * comparable surface — they were `console.error`'d and stayed invisible to
 * the site owner unless they had devtools open.
 *
 * This singleton bridges that gap: after each `activateInstalledEditorPlugins`
 * pass, the editor hook calls `setEditorActivationFailures(result.failed)`,
 * which fans out to React subscribers via the standard Zustand-style
 * `subscribe + getSnapshot` contract that `useSyncExternalStore` consumes.
 *
 * Kept as a plain singleton (not a slice on the editor store) because:
 *   - The data is purely UI-diagnostic; it never affects canvas rendering.
 *   - The editor store is for site mutations + in-canvas state.
 *   - The Plugins admin page is a sibling route, not under the canvas.
 */

import type { InstalledEditorPluginActivationFailure } from '@core/plugins/editorPluginLoader'

type Listener = () => void

/** Per-plugin activation error message, keyed by plugin id. */
let snapshot: Readonly<Record<string, string>> = Object.freeze({})

const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function failureMessage(failure: InstalledEditorPluginActivationFailure): string {
  const err = failure.error
  if (err instanceof Error) return err.message || err.name
  if (typeof err === 'string') return err
  return 'Plugin editor entrypoint failed to load.'
}

/**
 * Replace the snapshot with fresh failures from the latest activation pass.
 * Always overwrites — a re-activation either reproduces the failure (and the
 * entry stays) or succeeds (and the entry drops out). Uninstalling a plugin
 * triggers a fresh activation pass too, so removed plugins fall out
 * automatically without an explicit clear.
 */
export function setEditorActivationFailures(
  failures: ReadonlyArray<InstalledEditorPluginActivationFailure>,
): void {
  if (failures.length === 0 && Object.keys(snapshot).length === 0) return
  const next: Record<string, string> = {}
  for (const failure of failures) {
    next[failure.pluginId] = failureMessage(failure)
  }
  snapshot = Object.freeze(next)
  emit()
}

/** Subscribe + getSnapshot pair for `useSyncExternalStore`. */
export function subscribeEditorActivationErrors(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getEditorActivationErrors(): Readonly<Record<string, string>> {
  return snapshot
}
