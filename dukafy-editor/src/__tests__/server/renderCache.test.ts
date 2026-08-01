/**
 * Unit tests for server/publish/renderCache.ts (Layer B LRU render cache).
 *
 * Tests cover:
 *   - Bounded eviction (LRU oldest-first)
 *   - LRU recency: a read promotes an entry so it survives the next eviction
 *   - Hit/miss semantics
 *   - publishVersion invalidation via bumpPublishVersion()
 *   - Publish mid-render race: a version bump while a render is in flight
 *     discards the stale result instead of caching it as current
 *   - Single-flight: concurrent callers share one factory invocation
 *   - null factory return is not cached
 *   - Factory throws: error propagates and in-flight slot is cleared
 *   - resetForTests() resets all state
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  __setMaxEntriesForTests,
  getOrRender,
  getStats,
  resetForTests,
} from '../../../server/publish/renderCache'
import type { CachedResponse, RenderCacheKey } from '../../../server/publish/renderCache'
import { bumpPublishVersion } from '../../../server/publish/publishState'

function makeKey(urlPath: string, queryString = ''): RenderCacheKey {
  return { urlPath, queryString }
}

function makeResponse(body = 'hello'): CachedResponse {
  return { body, headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 }
}

/** Factory that immediately resolves with a CachedResponse. */
function factory(response: CachedResponse): () => Promise<CachedResponse | null> {
  return () => Promise.resolve(response)
}

beforeEach(() => {
  __setMaxEntriesForTests(1000)
  resetForTests()
})

describe('hit/miss semantics', () => {
  it('first call is a miss, second call with same key is a hit', async () => {
    const key = makeKey('/page')
    const resp = makeResponse('page')

    const first = await getOrRender(key, factory(resp))
    expect(getStats()).toEqual({ hits: 0, misses: 1, size: 1 })
    expect(first).toEqual(resp)

    const second = await getOrRender(key, factory(makeResponse('stale')))
    expect(getStats()).toEqual({ hits: 1, misses: 1, size: 1 })
    // Second call returned the cached response, not the new factory's response.
    expect(second).toEqual(resp)
  })

  it('different key is a miss', async () => {
    await getOrRender(makeKey('/a'), factory(makeResponse('a')))
    await getOrRender(makeKey('/b'), factory(makeResponse('b')))
    expect(getStats()).toEqual({ hits: 0, misses: 2, size: 2 })
  })

  it('queryString is part of the key', async () => {
    const resp1 = makeResponse('page1')
    const resp2 = makeResponse('page2')
    await getOrRender(makeKey('/posts', '?page=1'), factory(resp1))
    await getOrRender(makeKey('/posts', '?page=2'), factory(resp2))
    expect(getStats().size).toBe(2)
    expect(getStats().misses).toBe(2)

    const hit1 = await getOrRender(makeKey('/posts', '?page=1'), factory(makeResponse('stale')))
    expect(hit1).toEqual(resp1)
    expect(getStats().hits).toBe(1)
  })
})

describe('publishVersion invalidation', () => {
  it('bumpPublishVersion causes next read to be a miss', async () => {
    const key = makeKey('/about')
    const resp1 = makeResponse('v1')
    await getOrRender(key, factory(resp1))
    expect(getStats()).toEqual({ hits: 0, misses: 1, size: 1 })

    bumpPublishVersion()

    const resp2 = makeResponse('v2')
    const result = await getOrRender(key, factory(resp2))
    // The stale entry should have been replaced.
    expect(result).toEqual(resp2)
    expect(getStats().misses).toBe(2)
    expect(getStats().size).toBe(1)
  })

  it('subsequent read after bump + re-cache is a hit', async () => {
    const key = makeKey('/about')
    await getOrRender(key, factory(makeResponse('v1')))
    bumpPublishVersion()
    const resp2 = makeResponse('v2')
    await getOrRender(key, factory(resp2))

    // Third call: should be a hit with resp2
    const third = await getOrRender(key, factory(makeResponse('stale')))
    expect(third).toEqual(resp2)
    expect(getStats().hits).toBe(1)
  })
})

describe('publish mid-render race', () => {
  it('does not cache a render whose version was bumped while it was in flight', async () => {
    const key = makeKey('/race')
    let resolveFactory!: (v: CachedResponse) => void

    // A slow factory that resolves with the snapshot captured at render START.
    const slowFactory = () =>
      new Promise<CachedResponse>((resolve) => {
        resolveFactory = resolve
      })

    // Start the render (version 0). It is now in-flight.
    const inFlight = getOrRender(key, slowFactory)

    // A publish lands mid-render: bump the version, then the render finishes
    // with the now-stale (version-0) HTML.
    bumpPublishVersion() // version 0 -> 1
    resolveFactory(makeResponse('stale-v0'))

    const staleResult = await inFlight
    // The caller still receives the result it rendered...
    expect(staleResult).toEqual(makeResponse('stale-v0'))
    // ...but it must NOT have been cached as the current (v1) entry.
    expect(getStats().size).toBe(0)

    // The next request re-renders against the fresh snapshot and caches that.
    const fresh = makeResponse('fresh-v1')
    const result = await getOrRender(key, factory(fresh))
    expect(result).toEqual(fresh)
    expect(getStats().size).toBe(1)

    // And it is now a hit at the current version.
    const hit = await getOrRender(key, factory(makeResponse('ignored')))
    expect(hit).toEqual(fresh)
    expect(getStats().hits).toBe(1)
  })

  it('caches normally when no publish happens during the render', async () => {
    const key = makeKey('/no-race')
    let resolveFactory!: (v: CachedResponse) => void
    const slowFactory = () =>
      new Promise<CachedResponse>((resolve) => {
        resolveFactory = resolve
      })

    const inFlight = getOrRender(key, slowFactory)
    const resp = makeResponse('rendered')
    resolveFactory(resp)
    await inFlight

    // No bump occurred, so the entry is cached and served on the next read.
    expect(getStats().size).toBe(1)
    const hit = await getOrRender(key, factory(makeResponse('ignored')))
    expect(hit).toEqual(resp)
    expect(getStats().hits).toBe(1)
  })
})

describe('bounded eviction', () => {
  it('evicts oldest entries when cap is reached', async () => {
    const cap = 5
    __setMaxEntriesForTests(cap)
    resetForTests()

    // Fill cap + 5 distinct keys (pages 0–9). After this the map holds
    // only the newest `cap` entries (pages 5–9); the first 5 were evicted.
    for (let i = 0; i < cap + 5; i++) {
      await getOrRender(makeKey(`/page-${i}`), factory(makeResponse(`body-${i}`)))
    }

    expect(getStats().size).toBe(cap)

    // Verify that pages 0–4 were evicted: use a null-returning factory so
    // the miss check does NOT re-insert anything (which would cascade-evict
    // pages 5–9 before we can check them).
    let rerenderedCount = 0
    for (let i = 0; i < 5; i++) {
      let factoryCalled = false
      await getOrRender(makeKey(`/page-${i}`), async () => {
        factoryCalled = true
        return null // Don't cache — avoids displacing pages 5–9.
      })
      if (factoryCalled) rerenderedCount++
    }
    expect(rerenderedCount).toBe(5)

    // Pages 5–9 should still be in the cache (not evicted by the null-checks).
    let hitCount = 0
    for (let i = 5; i < cap + 5; i++) {
      let factoryCalled = false
      await getOrRender(makeKey(`/page-${i}`), async () => {
        factoryCalled = true
        return makeResponse(`re-${i}`)
      })
      if (!factoryCalled) hitCount++
    }
    expect(hitCount).toBe(cap)
  })
})

describe('LRU recency', () => {
  it('reading an entry promotes it so it survives the next eviction', async () => {
    __setMaxEntriesForTests(3)
    resetForTests()

    // Insert 3 entries: keys 0, 1, 2 (oldest to newest).
    await getOrRender(makeKey('/k0'), factory(makeResponse('v0')))
    await getOrRender(makeKey('/k1'), factory(makeResponse('v1')))
    await getOrRender(makeKey('/k2'), factory(makeResponse('v2')))

    // Read /k0 to promote it to most-recent.
    await getOrRender(makeKey('/k0'), factory(makeResponse('stale')))

    // Insert a 4th entry. Since cap=3, the LRU (now /k1, not /k0) is evicted.
    await getOrRender(makeKey('/k3'), factory(makeResponse('v3')))

    expect(getStats().size).toBe(3)

    // /k1 should be evicted (factory called again).
    let k1FactoryCalled = false
    await getOrRender(makeKey('/k1'), async () => {
      k1FactoryCalled = true
      return makeResponse('re-k1')
    })
    expect(k1FactoryCalled).toBe(true)

    // /k0 should still be cached (factory NOT called).
    let k0FactoryCalled = false
    await getOrRender(makeKey('/k0'), async () => {
      k0FactoryCalled = true
      return makeResponse('re-k0')
    })
    expect(k0FactoryCalled).toBe(false)
  })
})

describe('single-flight', () => {
  it('concurrent callers for the same key share one factory invocation', async () => {
    let factoryCallCount = 0
    let resolveFactory!: (v: CachedResponse) => void

    const slowFactory = () =>
      new Promise<CachedResponse>((resolve) => {
        factoryCallCount++
        resolveFactory = resolve
      })

    const key = makeKey('/slow')
    const [p1, p2] = await Promise.all([
      // Both start immediately; slowFactory should only be called once.
      (async () => getOrRender(key, slowFactory))(),
      (async () => {
        // Yield once to let the first call register in-flight before the second
        // call arrives.
        await Promise.resolve()
        return getOrRender(key, slowFactory)
      })(),
      // Resolve the factory after both callers have registered.
      (async () => {
        await Promise.resolve()
        await Promise.resolve()
        resolveFactory(makeResponse('slow-result'))
      })(),
    ])

    expect(factoryCallCount).toBe(1)
    expect(p1).toEqual(makeResponse('slow-result'))
    expect(p2).toEqual(makeResponse('slow-result'))
  })

  it('a subsequent sequential call after in-flight resolves is a cache hit', async () => {
    const key = makeKey('/after-flight')
    const resp = makeResponse('done')

    // First call: populates the cache.
    await getOrRender(key, factory(resp))
    expect(getStats()).toMatchObject({ hits: 0, misses: 1, size: 1 })

    // Second call: must be a cache hit (no factory invocation).
    let secondFactoryCalled = false
    const result = await getOrRender(key, async () => {
      secondFactoryCalled = true
      return makeResponse('stale')
    })
    expect(secondFactoryCalled).toBe(false)
    expect(result).toEqual(resp)
    expect(getStats().hits).toBe(1)
  })
})

describe('null factory return', () => {
  it('null result is not cached — factory is called again on next request', async () => {
    const key = makeKey('/missing')
    let factoryCallCount = 0

    const nullFactory = async (): Promise<CachedResponse | null> => {
      factoryCallCount++
      return null
    }

    const first = await getOrRender(key, nullFactory)
    expect(first).toBeNull()
    expect(getStats().size).toBe(0)

    const second = await getOrRender(key, nullFactory)
    expect(second).toBeNull()
    expect(factoryCallCount).toBe(2)
    expect(getStats().misses).toBe(2)
  })
})

describe('factory error handling', () => {
  it('factory throw propagates to the caller', async () => {
    const key = makeKey('/boom')
    const boom = async (): Promise<CachedResponse | null> => {
      throw new Error('render failed')
    }

    await expect(getOrRender(key, boom)).rejects.toThrow('render failed')
    expect(getStats().size).toBe(0)
  })

  it('in-flight slot is cleared after a factory error', async () => {
    const key = makeKey('/boom')
    let callCount = 0

    const boomFactory = async (): Promise<CachedResponse | null> => {
      callCount++
      throw new Error('render failed')
    }

    // First call: factory throws, in-flight slot must be cleared.
    await expect(getOrRender(key, boomFactory)).rejects.toThrow('render failed')

    // Second call: a healthy factory should now work (in-flight slot was cleared).
    const healthy = makeResponse('recovered')
    const result = await getOrRender(key, factory(healthy))
    expect(result).toEqual(healthy)
    expect(callCount).toBe(1) // boom factory called once; healthy factory is separate
    expect(getStats().size).toBe(1)
  })
})

describe('resetForTests', () => {
  it('clears size, hits, misses, and publishVersion', async () => {
    await getOrRender(makeKey('/x'), factory(makeResponse('x')))
    await getOrRender(makeKey('/x'), factory(makeResponse('stale')))
    bumpPublishVersion()

    resetForTests()

    expect(getStats()).toEqual({ hits: 0, misses: 0, size: 0 })

    // After reset, the same key is a miss again (version is back to 0).
    const resp = makeResponse('fresh')
    const result = await getOrRender(makeKey('/x'), factory(resp))
    expect(result).toEqual(resp)
    expect(getStats().misses).toBe(1)
  })
})
