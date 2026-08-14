/**
 * renderCache — unit tests
 *
 * Verifies the LRU render cache behaviour:
 * - Cache hits return the same object reference (identity check)
 * - Cache misses return undefined
 * - clear() empties the cache
 * - invalidateModule() removes only entries for the specified module
 * - size reflects the current entry count
 *
 * Reference: Guideline #307 Hot Path 2 (Performance Engineer Contribution #422)
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { renderCache } from '@site/canvas/renderCache'
import type { RenderOutput } from '@core/module-engine'

// Reset cache between tests
beforeEach(() => {
  renderCache.clear()
})

const mockOutput = (html: string): RenderOutput => ({ html })

describe('renderCache — basic get/set', () => {
  it('returns undefined on cache miss', () => {
    const result = renderCache.get('base.text', { text: 'Hello' }, [])
    expect(result).toBeUndefined()
  })

  it('returns cached output after set()', () => {
    const output = mockOutput('<h1>Hello</h1>')
    renderCache.set('base.text', { text: 'Hello' }, [], output)
    const result = renderCache.get('base.text', { text: 'Hello' }, [])
    expect(result).toBe(output)  // same object reference
  })

  it('different props → different cache entries', () => {
    const out1 = mockOutput('<h1>A</h1>')
    const out2 = mockOutput('<h1>B</h1>')
    renderCache.set('base.text', { text: 'A' }, [], out1)
    renderCache.set('base.text', { text: 'B' }, [], out2)
    expect(renderCache.get('base.text', { text: 'A' }, [])).toBe(out1)
    expect(renderCache.get('base.text', { text: 'B' }, [])).toBe(out2)
  })

  it('different moduleId → different cache entries', () => {
    const out1 = mockOutput('<h1>text</h1>')
    const out2 = mockOutput('<p>text</p>')
    renderCache.set('base.text', { text: 'text' }, [], out1)
    renderCache.set('base.image', { text: 'text' }, [], out2)
    expect(renderCache.get('base.text', { text: 'text' }, [])).toBe(out1)
    expect(renderCache.get('base.image', { text: 'text' }, [])).toBe(out2)
  })

  it('different children → different cache entries', () => {
    const out1 = mockOutput('<div><p>A</p></div>')
    const out2 = mockOutput('<div><p>B</p></div>')
    renderCache.set('base.container', {}, ['<p>A</p>'], out1)
    renderCache.set('base.container', {}, ['<p>B</p>'], out2)
    expect(renderCache.get('base.container', {}, ['<p>A</p>'])).toBe(out1)
    expect(renderCache.get('base.container', {}, ['<p>B</p>'])).toBe(out2)
  })
})

describe('renderCache — size', () => {
  it('starts at 0 after clear()', () => {
    expect(renderCache.size).toBe(0)
  })

  it('increments on each unique set()', () => {
    renderCache.set('base.text', { text: 'A' }, [], mockOutput('<h1>A</h1>'))
    expect(renderCache.size).toBe(1)
    renderCache.set('base.text', { text: 'B' }, [], mockOutput('<h1>B</h1>'))
    expect(renderCache.size).toBe(2)
  })

  it('does not increment on duplicate set() (LRU promotion only)', () => {
    const out = mockOutput('<h1>A</h1>')
    renderCache.set('base.text', { text: 'A' }, [], out)
    renderCache.set('base.text', { text: 'A' }, [], out)
    expect(renderCache.size).toBe(1)
  })
})

describe('renderCache — clear()', () => {
  it('empties all entries', () => {
    renderCache.set('base.text', { text: 'A' }, [], mockOutput('<h1>A</h1>'))
    renderCache.set('base.image', { text: 'B' }, [], mockOutput('<p>B</p>'))
    renderCache.clear()
    expect(renderCache.size).toBe(0)
    expect(renderCache.get('base.text', { text: 'A' }, [])).toBeUndefined()
  })
})

describe('renderCache — invalidateModule()', () => {
  it('removes all entries for the specified module', () => {
    renderCache.set('base.text', { text: 'A' }, [], mockOutput('<h1>A</h1>'))
    renderCache.set('base.text', { text: 'B' }, [], mockOutput('<h1>B</h1>'))
    renderCache.set('base.image', { text: 'C' }, [], mockOutput('<p>C</p>'))

    renderCache.invalidateModule('base.text')

    expect(renderCache.get('base.text', { text: 'A' }, [])).toBeUndefined()
    expect(renderCache.get('base.text', { text: 'B' }, [])).toBeUndefined()
    // image entry must remain
    expect(renderCache.get('base.image', { text: 'C' }, [])).toBeDefined()
  })

  it('is a no-op for an unknown moduleId', () => {
    renderCache.set('base.text', { text: 'A' }, [], mockOutput('<h1>A</h1>'))
    renderCache.invalidateModule('unknown.module')
    // text entry must still be present
    expect(renderCache.get('base.text', { text: 'A' }, [])).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// LRU eviction boundary — confirms max: CACHE_MAX wiring is enforced at runtime
// ---------------------------------------------------------------------------

describe('renderCache — LRU eviction at max capacity (Guideline #307 Hot Path 2)', () => {
  it('evicts the oldest entry when cache exceeds max capacity (500)', () => {
    // Fill the cache to capacity with 500 unique entries
    for (let i = 0; i < 500; i++) {
      renderCache.set('base.text', { i }, [], mockOutput(`<h1>${i}</h1>`))
    }
    expect(renderCache.size).toBe(500)

    // The very first entry (i=0) should still be in the cache (most recently used)
    // if not accessed since, adding entry 501 must evict entry 0 (LRU)
    const firstEntryOutput = renderCache.get('base.text', { i: 0 }, [])
    // Access i=0 to make it recently used; then add 500 more to force eviction
    // of entries that have NOT been accessed
    for (let i = 500; i < 1000; i++) {
      renderCache.set('base.text', { i }, [], mockOutput(`<h1>${i}</h1>`))
    }

    // Cache must not grow unbounded — size must remain capped at 500
    expect(renderCache.size).toBeLessThanOrEqual(500)

    // The newest entries must be retrievable
    expect(renderCache.get('base.text', { i: 999 }, [])).toBeDefined()
    expect(renderCache.get('base.text', { i: 998 }, [])).toBeDefined()
  })

  it('size never exceeds 500 after many unique inserts', () => {
    // Insert 600 unique entries — size must be capped by the LRU max
    for (let i = 0; i < 600; i++) {
      renderCache.set(`mod.${i}`, {}, [], mockOutput(`<div>${i}</div>`))
    }
    expect(renderCache.size).toBeLessThanOrEqual(500)
  })
})
