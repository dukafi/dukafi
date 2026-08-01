/**
 * urlState — workspace-agnostic primitives for making an admin view's current
 * selection directly linkable through the URL query string.
 *
 * Two halves of the same contract:
 *
 *   - `useInitialQueryParams()` — read the params present when the view first
 *     mounted (for one-shot "open this thing on load" deep links).
 *   - `useUrlQuerySync()`       — mirror the current selection back into the URL
 *     so a reload / bookmark / shared link reopens the same view.
 *
 * Both operate on `window.location` / `window.history` directly rather than the
 * admin router because selection changes only touch the query string, never the
 * pathname. The router's route match must NOT re-run for row/page selection.
 * Writing via `replaceState` without dispatching the router's
 * `instatic:locationchange` event keeps the route stable while the address bar stays
 * current.
 *
 * `replaceState` (never `pushState`) is used so flipping between rows/pages
 * doesn't flood the browser's back stack with intermediate selections.
 */
import { useEffect, useState } from 'react'

/**
 * Capture the query params present at first mount. The returned object is
 * stable for the component's lifetime (a `useState` lazy initializer runs
 * exactly once), so subsequent `useUrlQuerySync` writes never change what a
 * one-shot deep-link read observes.
 */
export function useInitialQueryParams(): URLSearchParams {
  const [params] = useState(
    () =>
      new URLSearchParams(
        typeof window === 'undefined' ? '' : window.location.search,
      ),
  )
  return params
}

/**
 * Mirror a set of query params into the URL via `history.replaceState`.
 *
 * - A key with a non-empty string value is written (`?key=value`).
 * - A key with a `null` / empty value is removed.
 * - Query params NOT listed in `params` are left untouched (so a workspace can
 *   own `table`/`row` while clearing a stale one-shot `?from=…`, etc.).
 *
 * No-ops when `enabled` is false, when running without a `window`, or when the
 * resulting URL would be identical to the current one.
 */
export function useUrlQuerySync(
  params: Record<string, string | null>,
  options?: { enabled?: boolean },
): void {
  const enabled = options?.enabled ?? true
  // Serialize so the effect re-runs only when the desired params actually
  // change — callers pass a fresh object literal every render.
  const serialized = JSON.stringify(params)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const desired = JSON.parse(serialized) as Record<string, string | null>
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(desired)) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }

    const nextHref = url.pathname + url.search + url.hash
    const currentHref =
      window.location.pathname + window.location.search + window.location.hash
    if (nextHref !== currentHref) {
      window.history.replaceState({}, '', nextHref)
    }
  }, [enabled, serialized])
}
