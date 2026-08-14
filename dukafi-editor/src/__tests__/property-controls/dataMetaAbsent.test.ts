/**
 * Dukafi has no generic data-tables backend, so `GET /admin/api/cms/data/_meta`
 * 404s by design. That must read as "no tables", never as an error.
 *
 * It used to reject, and the binding picker rendered a dead end — "Could not
 * load tables" — instead of the commerce entity fields and page/site/route/cart
 * sources it actually has. "Insert data token" was unusable anywhere the
 * commerce short-circuit did not apply: outside a loop, or inside an image or
 * cart loop.
 */
import { describe, it, expect, afterEach, mock } from 'bun:test'
import { clearDataMetaCache, loadDataMeta } from '@site/property-controls/DynamicBindingControl/cache'

const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original; clearDataMetaCache() })

function stub404() {
  globalThis.fetch = mock(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: { code: 'not_found', message: 'API endpoint not found' } }),
  } as unknown as Response)) as never
}

describe('loadDataMeta with no tables backend', () => {
  it('resolves to an empty table list instead of rejecting', async () => {
    clearDataMetaCache()
    stub404()

    const meta = await loadDataMeta()

    expect(meta.tables).toEqual([])
  })

  it('caches the empty result so the picker does not refetch on every open', async () => {
    clearDataMetaCache()
    stub404()

    await loadDataMeta()
    await loadDataMeta()
    await loadDataMeta()

    // One request, not one per binding control mounted.
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })
})
