/**
 * The relationship loop's canvas preview entry.
 *
 * Without a real entry the row template renders against nothing, so every
 * bound node shows its static placeholder — "Product title", "$0.00", no
 * image — and you can lay the row out but never see what it will look like.
 *
 * Field names must match `CommercePrefetcher`'s hashes exactly, because those
 * are what the publisher resolves `currentEntry.*` against. A mismatch here
 * means the canvas and the published page disagree.
 */
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { renderHook, waitFor } from '@testing-library/react'
import { useRelationshipPreviewEntry } from '@modules/store/relationshipLoop/useRelationshipPreviewEntry'

const PRODUCTS = [
  { id: 1, title: 'Draft Thing', slug: 'draft-thing', status: 'draft', variants: [], images: [] },
  {
    id: 2, title: 'Canvas Bag', slug: 'canvas-bag', status: 'active',
    variants: [
      { id: 20, sku: 'BAG-L', title: 'Large', priceCents: 13_950, currency: 'USD', stock: 3, position: 1 },
      { id: 21, sku: 'BAG-S', title: 'Small', priceCents: 9_900, currency: 'USD', stock: 5, position: 0 },
    ],
    images: [{ publicPath: '/uploads/bag.jpg' }],
  },
]
const COLLECTIONS = [
  { slug: 'featured', productIds: [2] },
  { slug: 'empty', productIds: [] },
]

function stubFetch() {
  globalThis.fetch = mock(async (url: string | URL) => {
    const path = String(url)
    const body = path.includes('/collections') ? { collections: COLLECTIONS } : { products: PRODUCTS }
    return { ok: true, json: async () => body } as unknown as Response
  }) as never
}

const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })

describe('useRelationshipPreviewEntry', () => {
  it('previews a real product, skipping drafts', async () => {
    stubFetch()
    const { result } = renderHook(() => useRelationshipPreviewEntry('products'))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.fields).toMatchObject({
      title: 'Canvas Bag',
      href: '/products/canvas-bag',
      imageUrl: '/uploads/bag.jpg',
      // Lowest position wins, and the money string is formatted — a text
      // binding cannot format currency itself.
      priceDisplay: '$99.00',
    })
  })

  it('previews the lowest-position variant for a variants loop', async () => {
    stubFetch()
    const { result } = renderHook(() => useRelationshipPreviewEntry('products/canvas-bag.variants'))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.fields).toMatchObject({
      sku: 'BAG-S', title: 'Small', priceDisplay: '$99.00', stock: 5,
    })
  })

  it('only previews a product that is actually in the named collection', async () => {
    stubFetch()
    const { result } = renderHook(() => useRelationshipPreviewEntry('collections/featured.products'))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.fields.slug).toBe('canvas-bag')
  })

  it('previews nothing for an empty or unknown collection', async () => {
    stubFetch()
    const empty = renderHook(() => useRelationshipPreviewEntry('collections/empty.products'))
    const unknown = renderHook(() => useRelationshipPreviewEntry('collections/nope.products'))

    // Borrowing an unrelated product here would make a broken slug look fine.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(empty.result.current).toBeNull()
    expect(unknown.result.current).toBeNull()
  })

  it('previews a relative source from the entry the enclosing loop is on', async () => {
    stubFetch()
    // What a nested `currentEntry.images` loop sees: the first image OF the
    // product the outer loop is previewing — no fetch, the data is in hand.
    const parent = {
      id: 'product-2',
      fields: { title: 'Canvas Bag', images: [{ url: '/uploads/bag.jpg', alt: 'Front' }] },
    }
    const { result } = renderHook(() => useRelationshipPreviewEntry('currentEntry.images', parent))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.fields).toMatchObject({ url: '/uploads/bag.jpg', alt: 'Front' })
  })

  it('previews nothing for a relative source with nothing in scope', async () => {
    stubFetch()
    const { result } = renderHook(() => useRelationshipPreviewEntry('currentEntry.images', null))

    await waitFor(() => expect(globalThis.fetch).toBeDefined())
    expect(result.current).toBeNull()
  })

  it('uses a synthetic entry for a cart loop, which has no catalogue', async () => {
    stubFetch()
    const { result } = renderHook(() => useRelationshipPreviewEntry('cart.items'))

    await waitFor(() => expect(result.current).not.toBeNull())
    // Field names match CartPayload, so the row previews what it will render.
    expect(result.current!.fields).toMatchObject({
      title: 'Sample product', variantTitle: 'Large',
      quantity: 2, linePriceDisplay: '$20.00',
    })
  })
})
