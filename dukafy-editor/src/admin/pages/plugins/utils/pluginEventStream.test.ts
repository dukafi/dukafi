import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { PluginEvent } from '@core/plugins/events'
import { subscribePluginEvents } from './pluginEventStream'

/**
 * Fake EventSource that records the per-kind handlers registered by the
 * stream, so a test can fire a synthetic SSE frame at a given kind and
 * observe whether it is dispatched to subscribers or dropped.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  handlers = new Map<string, (event: MessageEvent) => void>()
  closed = false

  constructor(
    public url: string,
    public init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(kind: string, handler: (event: MessageEvent) => void): void {
    this.handlers.set(kind, handler)
  }

  close(): void {
    this.closed = true
  }

  /** Simulate the server pushing a named SSE event with a raw data string. */
  fire(kind: string, data: string): void {
    const handler = this.handlers.get(kind)
    if (!handler) throw new Error(`no handler registered for kind "${kind}"`)
    handler(new MessageEvent(kind, { data }))
  }
}

const realEventSource = globalThis.EventSource

beforeEach(() => {
  FakeEventSource.instances = []
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
})

afterEach(() => {
  globalThis.EventSource = realEventSource
})

const WELL_FORMED: PluginEvent[] = [
  { kind: 'crash', pluginId: 'acme.demo', reason: 'boom', recentCrashCount: 2, occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'recovered', pluginId: 'acme.demo', afterCrashCount: 1, occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'parked', pluginId: 'acme.demo', reason: 'budget', recentCrashCount: 5, occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'restarted', pluginId: 'acme.demo', occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'installed', pluginId: 'acme.demo', version: '1.0.0', occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'updated', pluginId: 'acme.demo', fromVersion: '1.0.0', toVersion: '1.1.0', occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'uninstalled', pluginId: 'acme.demo', occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'enabled', pluginId: 'acme.demo', occurredAt: '2026-06-06T00:00:00.000Z' },
  { kind: 'disabled', pluginId: 'acme.demo', occurredAt: '2026-06-06T00:00:00.000Z' },
]

describe('pluginEventStream', () => {
  it('validates and dispatches a well-formed event of every kind', () => {
    const received: PluginEvent[] = []
    const unsubscribe = subscribePluginEvents((event) => received.push(event))
    const source = FakeEventSource.instances[0]!

    for (const event of WELL_FORMED) {
      source.fire(event.kind, JSON.stringify(event))
    }

    expect(received).toEqual(WELL_FORMED)
    unsubscribe()
  })

  it('drops an unknown-shape event without dispatching, and warns', () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      const received: PluginEvent[] = []
      const unsubscribe = subscribePluginEvents((event) => received.push(event))
      const source = FakeEventSource.instances[0]!

      // Right SSE kind, wrong payload shape (server-side field rename / corrupt frame).
      source.fire('crash', JSON.stringify({ kind: 'crash', pluginId: 'acme.demo' }))

      expect(received).toEqual([])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]![0]).toBe('[plugin-events] unexpected event shape')
      unsubscribe()
    } finally {
      console.warn = originalWarn
    }
  })

  it('drops a frame whose discriminant does not match any variant', () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      const received: PluginEvent[] = []
      const unsubscribe = subscribePluginEvents((event) => received.push(event))
      const source = FakeEventSource.instances[0]!

      source.fire('installed', JSON.stringify({ kind: 'teleported', pluginId: 'acme.demo' }))

      expect(received).toEqual([])
      expect(warn).toHaveBeenCalledTimes(1)
      unsubscribe()
    } finally {
      console.warn = originalWarn
    }
  })
})
