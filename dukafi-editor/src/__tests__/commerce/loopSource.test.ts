/**
 * Loop sources as paths — the editor half of `loop_source`/`source_items` in
 * `dukafi/publisher/render_page.rb`. Both sides must reach the same entity, or
 * the picker offers tokens the renderer cannot fill.
 */
import { describe, expect, it } from 'bun:test'
import { entityForLoopSource, legacyLoopSource, loopSourceFor } from '@core/commerce/loopSource'

describe('entityForLoopSource', () => {
  it('resolves root catalogue sources', () => {
    expect(entityForLoopSource('products', null)).toBe('product')
    expect(entityForLoopSource('collections/featured.products', null)).toBe('product')
    expect(entityForLoopSource('products/canvas-bag.variants', null)).toBe('variant')
    expect(entityForLoopSource('cart.items', null)).toBe('cartItem')
  })

  it('resolves a relative source against the entity in scope', () => {
    // The whole point: loop a list field, get that field's entity.
    expect(entityForLoopSource('currentEntry.images', 'product')).toBe('image')
    expect(entityForLoopSource('currentEntry.variants', 'product')).toBe('variant')
    expect(entityForLoopSource('currentEntry.products', 'collection')).toBe('product')
  })

  it('resolves two levels deep', () => {
    const image = entityForLoopSource('currentEntry.images', 'product')
    expect(entityForLoopSource('currentEntry.variants', image)).toBe('imageVariant')
  })

  it('returns null rather than guessing when a path cannot resolve', () => {
    // A relative source with nothing in scope.
    expect(entityForLoopSource('currentEntry.images', null)).toBeNull()
    // A field that is not a list — binding it is fine, looping it is not.
    expect(entityForLoopSource('currentEntry.title', 'product')).toBeNull()
    // A field that no longer exists after a rename.
    expect(entityForLoopSource('currentEntry.photos', 'product')).toBeNull()
    expect(entityForLoopSource('nonsense.path', null)).toBeNull()
    expect(entityForLoopSource('', null)).toBeNull()
  })
})

describe('legacy props', () => {
  it('maps relationship + slug the same way the publisher does', () => {
    expect(legacyLoopSource('products', '')).toBe('products')
    expect(legacyLoopSource('products', 'featured')).toBe('collections/featured.products')
    expect(legacyLoopSource('variants', '')).toBe('currentEntry.variants')
    expect(legacyLoopSource('variants', 'canvas-bag')).toBe('products/canvas-bag.variants')
    expect(legacyLoopSource('cartItems', '')).toBe('cart.items')
  })

  it('prefers an explicit source but falls back for older documents', () => {
    expect(loopSourceFor({ source: 'currentEntry.images', relationship: 'products' }))
      .toBe('currentEntry.images')
    // No `source` prop at all — a document authored before it existed.
    expect(loopSourceFor({ relationship: 'products', sourceSlug: 'featured' }))
      .toBe('collections/featured.products')
    expect(loopSourceFor({})).toBe('products')
  })
})
