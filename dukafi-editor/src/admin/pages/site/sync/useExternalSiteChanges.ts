/**
 * Notice when something else changed the store.
 *
 * The editor is no longer the only writer: an MCP client can edit and publish
 * pages while a tab sits open holding a stale copy. Without this the merchant
 * finds out by refreshing on a hunch.
 *
 * Polling, not streaming. Ruby has no streaming anywhere, and a websocket would
 * mean building a server for it; comparing one integer every few seconds costs
 * a single indexed row read and is enough for a human-scale workflow.
 *
 * It only ever NOTIFIES. Reloading on the merchant's behalf could discard
 * unsaved work mid-sentence, so the reload is a button they press.
 */
import { useEffect, useRef, useState } from 'react'
import { Type } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { lastSeenSiteSeq, onExternalSiteChange } from './siteSyncSeq'

const SiteVersionSchema = Type.Object({ seq: Type.Number() })

export const POLL_INTERVAL_MS = 5000

interface Options {
  enabled: boolean
  /** Swappable for tests; production uses the real endpoint. */
  fetchSeq?: () => Promise<number>
  /** Swappable for tests, which cannot afford to wait five real seconds. */
  intervalMs?: number
}

async function fetchSiteSeq(): Promise<number> {
  const { seq } = await apiRequest('/admin/api/cms/site-version', {
    schema: SiteVersionSchema,
    fallbackMessage: 'Could not check for changes',
  })
  return seq
}

/**
 * Returns true once the server's seq has moved past what this tab last saw.
 * Stays true until the tab reloads — the condition does not resolve itself,
 * and flickering it off would only hide a stale editor.
 */
export function useExternalSiteChanges(
  { enabled, fetchSeq = fetchSiteSeq, intervalMs = POLL_INTERVAL_MS }: Options,
): boolean {
  const [changed, setChanged] = useState(false)
  // Read through a ref so changing the fetcher between renders (tests) does
  // not tear down and restart the interval.
  const fetchRef = useRef(fetchSeq)
  fetchRef.current = fetchSeq

  useEffect(() => {
    if (!enabled || changed) return
    return onExternalSiteChange(() => setChanged(true))
  }, [enabled, changed])

  useEffect(() => {
    if (!enabled || changed) return

    let cancelled = false

    const check = async () => {
      // A hidden tab is not being read, so polling it is pure cost — and a
      // backgrounded browser throttles the timer anyway.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const seq = await fetchRef.current()
        // `lastSeenSiteSeq` is read at CHECK time, not captured: a save that
        // lands between two polls advances it, and comparing against a stale
        // capture would report our own write as someone else's.
        if (!cancelled && seq > lastSeenSiteSeq()) setChanged(true)
      } catch {
        // A failed check is not worth telling anyone about. The editor still
        // works, and the next tick tries again — surfacing "could not check
        // for changes" every five seconds during a blip would be worse than
        // the thing it warns about.
      }
    }

    const timer = setInterval(() => { void check() }, intervalMs)
    // Coming back to the tab is exactly when a stale editor matters most, and
    // is the moment a merchant is about to act on what they see.
    const onVisible = () => { void check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, changed, intervalMs])

  return changed
}
