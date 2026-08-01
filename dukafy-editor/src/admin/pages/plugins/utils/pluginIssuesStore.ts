/**
 * Global plugin-issues store. Drives the nav badge ("there's a plugin in
 * error state — go check") and any cross-page UI that wants to react to
 * the live plugin event stream.
 *
 * Two things flow in:
 *  1. The initial / refreshed list of plugins fetched via `listCmsPlugins`.
 *     Whenever the admin shell loads (or a route navigation re-fetches),
 *     we set the snapshot of in-error plugin ids from the response.
 *  2. Live events from the plugin SSE stream. `parked` / `crash` adds an
 *     entry; `recovered` / `restarted` / `disabled` / `uninstalled`
 *     removes one.
 *
 * Consumers subscribe via `useSyncExternalStore`. Resulting selector
 * yields the count of plugins currently in error state.
 *
 * Toasts are pushed by the same hook that mounts the SSE subscription —
 * see `usePluginEventBridge`.
 */

type Listener = () => void

let snapshot: Readonly<Set<string>> = Object.freeze(new Set<string>())
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setSnapshot(next: Set<string>): void {
  // Only emit if the membership actually changed (`useSyncExternalStore`
  // does shallow `Object.is` against the snapshot — but two frozen Sets
  // are never `Object.is` equal, so we must avoid spurious re-renders by
  // comparing contents).
  if (next.size === snapshot.size && [...next].every((id) => snapshot.has(id))) {
    return
  }
  snapshot = Object.freeze(next)
  emit()
}

export function setPluginsInErrorFromList(plugins: { id: string; lifecycleStatus?: string; enabled?: boolean }[]): void {
  const next = new Set<string>()
  for (const plugin of plugins) {
    if (plugin.enabled !== false && plugin.lifecycleStatus === 'error') {
      next.add(plugin.id)
    }
  }
  setSnapshot(next)
}

export function markPluginInError(pluginId: string): void {
  if (snapshot.has(pluginId)) return
  const next = new Set(snapshot)
  next.add(pluginId)
  setSnapshot(next)
}

export function clearPluginInError(pluginId: string): void {
  if (!snapshot.has(pluginId)) return
  const next = new Set(snapshot)
  next.delete(pluginId)
  setSnapshot(next)
}

export function subscribePluginIssues(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Convenience hook value — number of plugins currently in error state.
 * Bound to `useSyncExternalStore` by the nav badge.
 */
export function getPluginsInErrorCount(): number {
  return snapshot.size
}
