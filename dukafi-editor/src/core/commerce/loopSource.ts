/**
 * Loop sources as paths, and the entity each one yields.
 *
 * Mirrors `loop_source` / `source_items` in `dukafi/publisher/render_page.rb`.
 * The editor needs the same answer the publisher will reach so the binding
 * picker offers the fields that will actually resolve — a picker that lists
 * tokens the renderer can't fill is worse than no picker.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { entityAtPath, type EntityId } from './entitySchema'

export interface ParsedLoopSource {
  /** `products`, `collections/featured`, `currentEntry`, `cart`, … */
  root: string
  /** The kind before any `/slug`. */
  kind: string
  slug: string | null
  /** Dotted segments after the root. */
  fields: string[]
}

export function parseLoopSource(source: string): ParsedLoopSource | null {
  const trimmed = source.trim()
  if (!trimmed) return null
  const [root, ...fields] = trimmed.split('.')
  const [kind, slug] = root.split('/', 2)
  return { root, kind, slug: slug ?? null, fields }
}

/**
 * Documents authored before `source` existed carry `relationship` +
 * `sourceSlug`. Same mapping the publisher applies, so both sides agree on
 * what a legacy loop means.
 */
export function legacyLoopSource(relationship: string, sourceSlug: string): string {
  const slug = sourceSlug.trim()
  if (relationship === 'cartItems') return 'cart.items'
  if (relationship === 'currentQuery') return 'current-query'
  if (relationship === 'dataRows') return slug ? `data/${slug}` : 'data'
  if (relationship === 'variants') return slug ? `products/${slug}.variants` : 'currentEntry.variants'
  return slug ? `collections/${slug}.products` : 'products'
}

/** The source a loop node resolves to, explicit prop or legacy fallback. */
export function loopSourceFor(props: Record<string, unknown>): string {
  const explicit = typeof props.source === 'string' ? props.source.trim() : ''
  if (explicit) return explicit
  const slug = typeof props.sourceSlug === 'string' && props.sourceSlug
    ? props.sourceSlug
    : typeof props.collectionSlug === 'string' ? props.collectionSlug : ''
  const relationship = typeof props.relationship === 'string' ? props.relationship : 'products'
  return legacyLoopSource(relationship, slug)
}

/**
 * The entity a source yields, given the entity already in scope (null at the
 * top level). Returns null when the path can't be resolved — a stale field
 * name after a rename, or a relative source used where nothing is in scope.
 * Null is meaningful: it means "we cannot promise these tokens resolve".
 */
export function entityForLoopSource(source: string, inScope: EntityId | null): EntityId | null {
  const parsed = parseLoopSource(source)
  if (!parsed) return null

  switch (parsed.kind) {
    case 'products':
      // `products` is the catalogue; `products/<slug>.variants` walks from one.
      return parsed.slug ? entityAtPath('product', parsed.fields) : (parsed.fields.length === 0 ? 'product' : null)
    case 'collections':
      return parsed.slug
        ? entityAtPath('collection', parsed.fields)
        : (parsed.fields.length === 0 ? 'collection' : null)
    case 'cart':
      return parsed.fields.join('.') === 'items' ? 'cartItem' : null
    case 'current-query':
      return parsed.slug || parsed.fields.length > 0 ? null : 'product'
    // Approved reviews, a flat list with no slug to name — the only top-level
    // source that is not a slug-keyed catalogue.
    case 'reviews':
      return parsed.slug ? null : (parsed.fields.length === 0 ? 'review' : entityAtPath('review', parsed.fields))
    // The signed-in customer's own orders. Like `cart.items` it never bakes —
    // the loop becomes a placeholder that fetches itself — but the editor
    // still needs to know which fields resolve inside it.
    // The store's configured payment methods — the same for every visitor, so
    // unlike orders this one bakes.
    case 'paymentProviders':
      return parsed.slug ? null : (parsed.fields.length === 0 ? 'paymentProvider' : entityAtPath('paymentProvider', parsed.fields))
    case 'orders':
      return parsed.slug ? null : (parsed.fields.length === 0 ? 'order' : entityAtPath('order', parsed.fields))
    case 'data':
      return parsed.slug && parsed.fields.length === 0 ? 'dataRow' : null
    case 'currentEntry':
      return inScope ? entityAtPath(inScope, parsed.fields) : null
    default:
      return null
  }
}
