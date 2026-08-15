/**
 * A real catalogue entry for a relationship loop's canvas preview.
 *
 * Without this the loop renders its row template against nothing, so every
 * bound node falls back to its static placeholder — "Product title", "$0.00",
 * an empty image. You could lay the row out but never see what it would
 * actually look like.
 *
 * ONE entry, deliberately. The published page repeats the row per item; the
 * canvas shows a single instance because that is the thing you edit. Seeing
 * eight copies of one template makes selection and styling worse, not better.
 *
 * Fields mirror `CommercePrefetcher`'s product/variant hashes exactly — the
 * same names the publisher resolves `currentEntry.*` against — so what the
 * canvas shows is what gets published.
 */
import { useEffect, useState } from 'react'
import type { LoopItem } from '@core/loops/types'
import { parseLoopSource } from '@core/commerce/loopSource'

interface ApiVariant {
  id: number
  sku: string
  title: string
  priceCents: number
  currency: string
  stock: number
  position: number
}

interface ApiProduct {
  id: number
  title: string
  slug: string
  status: string
  variants: ApiVariant[]
  images: Array<{ publicPath: string }>
}

interface ApiReview {
  id: string
  authorName: string
  rating: number
  body: string
  productSlug: string | null
  createdAt: string | null
}

interface ApiCollection {
  slug: string
  productIds: number[]
}

function money(cents: number | undefined, currency: string | undefined): string {
  const amount = ((cents ?? 0) / 100).toFixed(2)
  return (currency ?? 'USD') === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

function productEntry(product: ApiProduct): LoopItem {
  const variant = [...product.variants].sort((a, b) => a.position - b.position)[0]
  return {
    id: `product-${product.id}`,
    fields: {
      id: product.id,
      slug: product.slug,
      title: product.title,
      href: `/products/${product.slug}`,
      imageUrl: product.images[0]?.publicPath ?? '',
      priceCents: variant?.priceCents ?? 0,
      currency: variant?.currency ?? 'USD',
      priceDisplay: money(variant?.priceCents, variant?.currency),
    },
  }
}

function variantEntry(variant: ApiVariant): LoopItem {
  return {
    id: `variant-${variant.id}`,
    fields: {
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      priceCents: variant.priceCents,
      currency: variant.currency,
      priceDisplay: money(variant.priceCents, variant.currency),
      stock: variant.stock,
      position: variant.position,
    },
  }
}

/**
 * The five stars of a rating, built here rather than fetched — `Review#stars`
 * in Ruby derives them from the score the same way, and duplicating four
 * fields beats an endpoint that exists only to say "three filled, two empty".
 */
function starEntries(rating: number): Array<Record<string, unknown>> {
  return [1, 2, 3, 4, 5].map((position) => {
    const filled = position <= rating
    return { position, filled, state: filled ? 'filled' : 'empty', symbol: filled ? '\u2605' : '\u2606' }
  })
}

function reviewEntry(review: ApiReview): LoopItem {
  const rating = Math.max(0, Math.min(5, Math.round(review.rating)))
  return {
    id: `review-${review.id}`,
    fields: {
      id: review.id,
      body: review.body,
      authorName: review.authorName,
      rating,
      ratingStars: '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating),
      stars: starEntries(rating),
      productSlug: review.productSlug ?? '',
      productTitle: '',
      createdAt: review.createdAt ?? '',
      date: review.createdAt ? new Date(review.createdAt).toLocaleDateString() : '',
      // The canvas cannot know whether the previewed review is attached to an
      // order, and guessing "verified" would flatter every preview. The list
      // endpoint carries it, but only approved reviews are previewed here, so
      // this stays whatever the row said.
      verified: false,
      verifiedLabel: 'Customer',
    },
  }
}

/**
 * An order history belongs to a signed-in customer, and the canvas has no
 * customer — the merchant editing the page is not the shopper. So this is
 * synthetic for the same reason the cart sample is, with plausible values
 * rather than empty strings so the row can actually be laid out. Shape
 * matches `OrderPayload`.
 */
const ORDER_SAMPLE: LoopItem = {
  id: 'order-sample',
  fields: {
    id: 1042,
    number: '#1042',
    reference: 'sample-order-token',
    status: 'paid',
    statusLabel: 'Paid',
    isPaid: true,
    isAwaitingPayment: false,
    date: '3 August 2026',
    placedAt: '2026-08-03T09:15:00Z',
    currency: 'USD',
    itemCount: 2,
    subtotalCents: 4000,
    subtotalDisplay: '$40.00',
    discountCents: 400,
    discountDisplay: '$4.00',
    discountCode: 'WEEKEND20',
    hasDiscount: true,
    shippingCents: 0,
    shippingDisplay: '$0.00',
    totalCents: 3600,
    totalDisplay: '$36.00',
    lines: [
      {
        title: 'Sample product', variantTitle: 'Large', sku: 'SAMPLE-1', quantity: 2,
        unitPriceCents: 2000, unitPriceDisplay: '$20.00',
        linePriceCents: 4000, linePriceDisplay: '$40.00',
        productSlug: 'sample-product', href: '/products/sample-product', imageUrl: '',
      },
    ],
  },
}

/**
 * A cart has no catalogue to read from in the editor, so this one is
 * synthetic — clearly plausible values rather than empty strings, so the row
 * can be laid out. The shape matches `CartPayload`'s entries.
 */
const CART_SAMPLE: LoopItem = {
  id: 'cart-sample',
  fields: {
    productSlug: 'sample-product',
    sku: 'SAMPLE-1',
    title: 'Sample product',
    variantTitle: 'Large',
    href: '/products/sample-product',
    imageUrl: '',
    quantity: 2,
    currency: 'USD',
    unitPriceCents: 1000,
    unitPriceDisplay: '$10.00',
    linePriceCents: 2000,
    linePriceDisplay: '$20.00',
    stock: 5,
  },
}

/**
 * A real entry for the canvas preview, resolved from the loop's SOURCE PATH —
 * the same paths the publisher walks.
 *
 * `parentEntry` is what a nested loop previews against: inside a products loop,
 * `currentEntry.images` previews the first image OF the previewed product, so
 * the canvas shows the same row the published page will.
 */
export function useRelationshipPreviewEntry(
  source: string,
  parentEntry: LoopItem | null = null,
): LoopItem | null {
  const [entry, setEntry] = useState<LoopItem | null>(null)
  const parentKey = parentEntry ? parentEntry.id : ''

  useEffect(() => {
    const parsed = parseLoopSource(source)
    if (!parsed) { setEntry(null); return }

    // Only APPROVED reviews, matching what the publisher will iterate — a
    // canvas previewing a pending review would show text that never ships.
    if (parsed.kind === 'reviews') {
      const controller = new AbortController()
      void fetch('/admin/api/cms/reviews?status=approved', { credentials: 'same-origin', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return null
          const { reviews } = await response.json() as { reviews: ApiReview[] }
          return reviews.length > 0 ? reviewEntry(reviews[0]) : null
        })
        .then((next) => { if (!controller.signal.aborted) setEntry(next) })
        .catch(() => undefined)
      return () => controller.abort()
    }

    if (parsed.kind === 'orders') {
      setEntry(parsed.fields.length === 0 ? ORDER_SAMPLE : null)
      return
    }

    if (parsed.kind === 'cart') {
      setEntry(parsed.fields.join('.') === 'items' ? CART_SAMPLE : null)
      return
    }

    // A relative source reads a list field off the entry the enclosing loop is
    // previewing — no fetch needed, the data is already in hand.
    if (parsed.kind === 'currentEntry') {
      if (!parentEntry) { setEntry(null); return }
      let value: unknown = parentEntry.fields
      for (const field of parsed.fields) {
        value = (value as Record<string, unknown> | undefined)?.[field]
      }
      const first = Array.isArray(value) ? value[0] : null
      setEntry(
        first && typeof first === 'object'
          ? { id: `${parentEntry.id}-${parsed.fields.join('.')}-0`, fields: first as Record<string, unknown> }
          : null,
      )
      return
    }

    const relationship = parsed.fields.at(-1) === 'variants' ? 'variants' : 'products'
    const sourceSlug = parsed.slug ?? ''

    const controller = new AbortController()
    const load = async () => {
      const response = await fetch('/admin/api/cms/commerce/products', {
        credentials: 'same-origin',
        signal: controller.signal,
      })
      if (!response.ok) return null
      const { products } = await response.json() as { products: ApiProduct[] }
      const active = products.filter((product) => product.status === 'active')
      const pool = active.length > 0 ? active : products
      if (pool.length === 0) return null

      if (relationship === 'variants') {
        // `products/<slug>.variants` names a product.
        // A specific product was named — otherwise the first product with any
        // variant at all, so the row still previews on a fresh catalogue.
        const named = sourceSlug ? pool.find((product) => product.slug === sourceSlug) : null
        const source = named ?? pool.find((product) => product.variants.length > 0)
        const variant = source?.variants.slice().sort((a, b) => a.position - b.position)[0]
        return variant ? variantEntry(variant) : null
      }

      // A bare `products` source, or `products/<slug>` — no collection scoping.
      if (!sourceSlug || parsed.kind !== 'collections') return productEntry(pool[0])

      // Scoped to a collection: preview a product that is actually in it, so
      // an empty collection reads as empty rather than borrowing someone
      // else's product and looking fine.
      const collectionsResponse = await fetch('/admin/api/cms/commerce/collections', {
        credentials: 'same-origin',
        signal: controller.signal,
      })
      if (!collectionsResponse.ok) return productEntry(pool[0])
      const { collections } = await collectionsResponse.json() as { collections: ApiCollection[] }
      const match = collections.find((collection) => collection.slug === sourceSlug)
      if (!match) return null

      const member = pool.find((product) => match.productIds.includes(product.id))
      return member ? productEntry(member) : null
    }

    void load()
      .then((next) => { if (!controller.signal.aborted) setEntry(next) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [source, parentKey, parentEntry])

  return entry
}
