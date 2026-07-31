/**
 * Plugin event stream — a singleton EventSource subscription to the
 * server's `/admin/api/cms/plugins/events` SSE endpoint. Every admin tab
 * subscribes ONCE; multiple consumers (PluginsPage live-refresh, toast
 * dispatcher, nav badge) attach via `subscribePluginEvents`.
 *
 * The browser's EventSource auto-reconnects on transport errors with
 * native exponential backoff. We don't need bespoke retry logic.
 *
 * Lazy connect: the connection is only opened on the first subscriber
 * and closed when the last subscriber unsubscribes — so admin pages
 * that don't care about plugin events don't pay for the open socket.
 */

import { safeParseValue } from '@core/utils/typeboxHelpers'
import {
  PLUGIN_EVENT_KINDS,
  PluginEventSchema,
  type PluginEvent,
} from '@core/plugins/events'

export type { PluginEvent }

type Listener = (event: PluginEvent) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null

function ensureConnected(): void {
  if (source) return
  source = new EventSource('/admin/api/cms/plugins/events', { withCredentials: true })
  for (const kind of PLUGIN_EVENT_KINDS) {
    source.addEventListener(kind, (event) => {
      try {
        const result = safeParseValue(PluginEventSchema, JSON.parse((event as MessageEvent).data))
        if (!result.ok) {
          console.warn('[plugin-events] unexpected event shape', result.errors)
          return
        }
        const payload = result.value
        for (const listener of listeners) {
          try { listener(payload) } catch (err) {
            console.error('[plugin-events] listener threw:', err)
          }
        }
      } catch (err) {
        console.error(`[plugin-events] failed to parse "${kind}" payload:`, err)
      }
    })
  }
  // EventSource sets readyState to 0 (CONNECTING) on transport errors and
  // auto-reconnects. We don't need explicit handling.
}

function disconnectIfIdle(): void {
  if (listeners.size > 0) return
  source?.close()
  source = null
}

export function subscribePluginEvents(listener: Listener): () => void {
  listeners.add(listener)
  ensureConnected()
  return () => {
    listeners.delete(listener)
    disconnectIfIdle()
  }
}
