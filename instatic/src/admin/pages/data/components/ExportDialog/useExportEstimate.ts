/**
 * useExportEstimate — live, server-accurate bundle size estimate.
 *
 * Instead of guessing from per-row/per-asset constants (which ignored media
 * entirely and ran ~10× low on content), this hook asks the server for the
 * exact size the bundle WOULD have for the current `ExportRequest`. The server
 * runs the same selection logic as the real export but skips reading media
 * bytes off disk, so the number can never drift from the actual download.
 *
 * Fetches are debounced (options change as the operator clicks toggles) and
 * cancellable (a superseded request aborts). The previous value is kept on
 * screen while a new estimate is in flight to avoid flicker.
 */

import { useEffect, useState } from 'react'
import { estimateSiteBundle } from '@core/persistence/cmsTransfer'
import { isAbortError } from '@core/http'
import type { ExportRequest } from '@core/data/bundleSchema'

const DEBOUNCE_MS = 250

interface UseExportEstimateResult {
  /** Display string, e.g. "~92.3 MB". `'…'` while the first estimate loads. */
  formatted: string
  /** True while a request is in flight. */
  loading: boolean
  /** True when the last request failed (non-abort). */
  error: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return '< 1 KB'
  if (bytes < 1_000_000) return `~${Math.round(bytes / 1024)} KB`
  return `~${(bytes / 1_048_576).toFixed(1)} MB`
}

/**
 * @param request The export request to size, or `null` to pause estimating
 *                (e.g. while the dialog is closed).
 */
export function useExportEstimate(request: ExportRequest | null): UseExportEstimateResult {
  const [bytes, setBytes] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Serialize the request to a stable primitive so the effect re-runs only when
  // the actual selection changes — not on every render's fresh object identity.
  const requestKey = request ? JSON.stringify(request) : null

  useEffect(() => {
    if (requestKey === null) return

    const parsed = JSON.parse(requestKey) as ExportRequest
    const controller = new AbortController()

    // All state updates happen inside deferred callbacks (the debounce timer
    // and the promise handlers), never synchronously in the effect body —
    // synchronous setState-in-effect cascades an extra render and is linted out.
    const timer = setTimeout(() => {
      setLoading(true)
      setError(false)
      estimateSiteBundle(parsed, controller.signal)
        .then((result) => {
          setBytes(result.bytes)
          setLoading(false)
        })
        .catch((err) => {
          if (isAbortError(err)) return // superseded — a newer request is running
          setError(true)
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [requestKey])

  return {
    formatted: bytes === null ? '…' : formatBytes(bytes),
    loading,
    error,
  }
}
