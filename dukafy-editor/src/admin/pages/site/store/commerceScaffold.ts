/**
 * Commerce scaffolds — code-defined subtree snapshots for "Insert product" /
 * "Insert collection" / "Insert variant list" in the module picker.
 *
 * These replace the old opaque `store.product-card` with a plain, composable
 * node tree: a `base.link` wrapping bound `base.image`/`base.text` children,
 * the same `dynamicBindings`/`currentEntry` mechanism already used by
 * `dukafy/services/product_template.rb`'s title node. Each returned node is
 * fully ordinary — selectable, restylable, deletable — once inserted.
 *
 * Pure builder functions only (no editor-store imports), matching the
 * constraint on `subtreeSnapshot.ts` — `insertSnapshotSubtrees` mints fresh
 * node ids on insert, so the literal ids used here never leak into the live
 * tree and can stay simple/readable.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */
import type { PageNode } from '@core/page-tree'

export type RelationshipKind = 'products' | 'variants' | 'cartItems'

export interface SubtreeSnapshotShape {
  rootNodeIds: string[]
  nodes: Record<string, PageNode>
}

function node(
  id: string,
  moduleId: string,
  children: string[] = [],
  props: Record<string, unknown> = {},
): PageNode {
  return { id, moduleId, props, breakpointOverrides: {}, children, classIds: [] }
}

function acting(target: PageNode, action: { type: 'cart.removeItem' | 'cart.setQuantity'; delta?: number }): PageNode {
  return { ...target, actions: { click: action } }
}

function bound(
  target: PageNode,
  bindings: Record<string, { source: 'currentEntry' | 'cart'; field: string; format?: 'plain' | 'html' | 'url' | 'media'; fallback?: 'static' | 'empty' }>,
): PageNode {
  return { ...target, dynamicBindings: bindings }
}

/**
 * A single product's image/title/price, wrapped in a link to the product
 * page — the composable replacement for `store.product-card`. Used both for
 * a standalone "Insert product" and as a relationship-loop's product row.
 */
export function buildProductScaffoldSnapshot(): SubtreeSnapshotShape {
  const nodes: Record<string, PageNode> = {
    'scaffold-product-root': node('scaffold-product-root', 'base.link', [
      'scaffold-product-image',
      'scaffold-product-title',
      'scaffold-product-price',
    ]),
    'scaffold-product-image': bound(
      node('scaffold-product-image', 'base.image'),
      { src: { source: 'currentEntry', field: 'imageUrl', format: 'media', fallback: 'empty' } },
    ),
    'scaffold-product-title': bound(
      node('scaffold-product-title', 'base.text', [], { tag: 'h3', text: 'Product title' }),
      { text: { source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' } },
    ),
    'scaffold-product-price': bound(
      node('scaffold-product-price', 'base.text', [], { tag: 'span', text: '$0.00' }),
      { text: { source: 'currentEntry', field: 'priceDisplay', format: 'plain', fallback: 'static' } },
    ),
  }
  nodes['scaffold-product-root'] = bound(nodes['scaffold-product-root'], {
    href: { source: 'currentEntry', field: 'href', format: 'url', fallback: 'static' },
  })
  return { rootNodeIds: ['scaffold-product-root'], nodes }
}

/**
 * A single variant's title/price. No image or link — a variant has neither
 * a product-style image field nor its own page to link to.
 */
export function buildVariantRowSnapshot(): SubtreeSnapshotShape {
  const nodes: Record<string, PageNode> = {
    'scaffold-variant-root': node('scaffold-variant-root', 'base.container', [
      'scaffold-variant-title',
      'scaffold-variant-price',
    ]),
    'scaffold-variant-title': bound(
      node('scaffold-variant-title', 'base.text', [], { tag: 'span', text: 'Variant title' }),
      { text: { source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' } },
    ),
    'scaffold-variant-price': bound(
      node('scaffold-variant-price', 'base.text', [], { tag: 'span', text: '$0.00' }),
      { text: { source: 'currentEntry', field: 'priceDisplay', format: 'plain', fallback: 'static' } },
    ),
  }
  return { rootNodeIds: ['scaffold-variant-root'], nodes }
}

/**
 * One cart line: product title, variant, quantity x unit price, line total.
 *
 * Fields come from `CartPayload` (`dukafy/services/cart_payload.rb`) — the
 * cart's data contract. Every node here is plain and rebindable; this is a
 * starting point a merchant edits, not a component they're stuck with.
 */
export function buildCartLineRowSnapshot(): SubtreeSnapshotShape {
  const nodes: Record<string, PageNode> = {
    'scaffold-cart-line-root': node('scaffold-cart-line-root', 'base.container', [
      'scaffold-cart-line-title',
      'scaffold-cart-line-variant',
      'scaffold-cart-line-qty',
      'scaffold-cart-line-total',
      'scaffold-cart-line-dec',
      'scaffold-cart-line-inc',
      'scaffold-cart-line-remove',
    ]),
    'scaffold-cart-line-title': bound(
      node('scaffold-cart-line-title', 'base.text', [], { tag: 'span', text: 'Product title' }),
      { text: { source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' } },
    ),
    'scaffold-cart-line-variant': bound(
      node('scaffold-cart-line-variant', 'base.text', [], { tag: 'span', text: 'Option' }),
      { text: { source: 'currentEntry', field: 'variantTitle', format: 'plain', fallback: 'static' } },
    ),
    'scaffold-cart-line-qty': bound(
      node('scaffold-cart-line-qty', 'base.text', [], { tag: 'span', text: '1' }),
      { text: { source: 'currentEntry', field: 'quantity', format: 'plain', fallback: 'static' } },
    ),
    'scaffold-cart-line-total': bound(
      node('scaffold-cart-line-total', 'base.text', [], { tag: 'span', text: '$0.00' }),
      { text: { source: 'currentEntry', field: 'linePriceDisplay', format: 'plain', fallback: 'static' } },
    ),
    // Plain buttons carrying cart verbs. Ordinary `base.button` nodes — the
    // merchant restyles, relabels, reorders or deletes any of them. The line's
    // SKU is filled in by the publisher from the loop iteration.
    'scaffold-cart-line-dec': acting(
      node('scaffold-cart-line-dec', 'base.button', [], { label: '−', href: '' }),
      { type: 'cart.setQuantity', delta: -1 },
    ),
    'scaffold-cart-line-inc': acting(
      node('scaffold-cart-line-inc', 'base.button', [], { label: '+', href: '' }),
      { type: 'cart.setQuantity', delta: 1 },
    ),
    'scaffold-cart-line-remove': acting(
      node('scaffold-cart-line-remove', 'base.button', [], { label: 'Remove', href: '' }),
      { type: 'cart.removeItem' },
    ),
  }
  return { rootNodeIds: ['scaffold-cart-line-root'], nodes }
}

/**
 * A whole cart: the lines loop plus a count and subtotal bound to the `cart`
 * frame.
 *
 * Two things have to be true at once here, and they pull in opposite
 * directions:
 *
 *  · The summary sits OUTSIDE the loop, because inside it `currentEntry` is a
 *    single line — a cart-wide total has to read the `cart` frame, and a node
 *    inside the loop would repeat once per line anyway.
 *
 *  · But a baked page is one file for every visitor, so a node outside the
 *    loop has no cart at all and renders blank. Hence `region: 'cart'` on the
 *    root: it makes the whole subtree re-fetch per visitor, which is what
 *    gives the summary a cart to read. Without the marker this scaffold looks
 *    right on canvas and publishes empty.
 */
export function buildCartScaffoldSnapshot(): SubtreeSnapshotShape {
  const loop = buildRelationshipLoopSnapshot('cartItems')
  const rootId = 'scaffold-cart-root'
  const countId = 'scaffold-cart-count'
  const subtotalId = 'scaffold-cart-subtotal'
  const nodes: Record<string, PageNode> = {
    ...loop.nodes,
    [countId]: bound(
      node(countId, 'base.text', [], { tag: 'p', text: 'Items in cart: 0' }),
      { text: { source: 'cart', field: 'count', format: 'plain', fallback: 'static' } },
    ),
    [subtotalId]: bound(
      node(subtotalId, 'base.text', [], { tag: 'p', text: 'Subtotal $0.00' }),
      { text: { source: 'cart', field: 'subtotalDisplay', format: 'plain', fallback: 'static' } },
    ),
    [rootId]: {
      ...node(rootId, 'base.container', [loop.rootNodeIds[0], countId, subtotalId]),
      actions: { region: 'cart' },
    },
  }
  return { rootNodeIds: [rootId], nodes }
}

function buildRelationshipRowSnapshot(relationship: RelationshipKind): SubtreeSnapshotShape {
  if (relationship === 'variants') return buildVariantRowSnapshot()
  if (relationship === 'cartItems') return buildCartLineRowSnapshot()
  return buildProductScaffoldSnapshot()
}

/**
 * A `store.relationship-loop` pre-configured for `relationship`, containing
 * the row scaffold above as its repeated child. "Insert collection" is this
 * function called with `'products'` — there is no separate "collection"
 * node concept once the card is decomposed.
 */
export function buildRelationshipLoopSnapshot(relationship: RelationshipKind): SubtreeSnapshotShape {
  const row = buildRelationshipRowSnapshot(relationship)
  const rowRootId = row.rootNodeIds[0]
  const loopId = 'scaffold-relationship-loop'
  const nodes: Record<string, PageNode> = {
    ...row.nodes,
    // A cart loop has no catalog source to point at and no meaningful
    // ordering — lines come back in insertion order for the one visitor.
    [loopId]: node(loopId, 'store.relationship-loop', [rowRootId], relationship === 'cartItems'
      ? { relationship, sourceSlug: '', perPage: 100, orderBy: 'manual', direction: 'asc', offset: 0 }
      : { relationship, sourceSlug: '', perPage: 12, orderBy: 'manual', direction: 'asc', offset: 0 }),
  }
  return { rootNodeIds: [loopId], nodes }
}
