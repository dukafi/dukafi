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

export type RelationshipKind = 'products' | 'variants'

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

function bound(
  target: PageNode,
  bindings: Record<string, { source: 'currentEntry'; field: string; format?: 'plain' | 'html' | 'url' | 'media'; fallback?: 'static' | 'empty' }>,
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

function buildRelationshipRowSnapshot(relationship: RelationshipKind): SubtreeSnapshotShape {
  return relationship === 'variants' ? buildVariantRowSnapshot() : buildProductScaffoldSnapshot()
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
    [loopId]: node(loopId, 'store.relationship-loop', [rowRootId], {
      relationship,
      sourceSlug: '',
      perPage: 12,
      orderBy: 'manual',
      direction: 'asc',
      offset: 0,
    }),
  }
  return { rootNodeIds: [loopId], nodes }
}
