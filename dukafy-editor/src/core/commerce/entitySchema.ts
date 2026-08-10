/**
 * Commerce entity schemas — what you can bind to, and what you can loop over.
 *
 * ONE definition, read by three consumers:
 *   · the binding picker, to list `currentEntry.*` tokens
 *   · the relationship loop, to know which fields are iterable
 *   · Ruby, via `scripts/export-schemas.ts` → `publisher/schemas/commerce_entities.schema.json`
 *
 * The important field kind is `list`: `product.images` is a list OF `image`,
 * `product.variants` is a list OF `variant`. That single fact gives nesting —
 * loop a list field and the entity in scope becomes the `of` entity, whose own
 * fields (including its own lists) become the available tokens. A CRM entity
 * is a new entry here and nothing else changes.
 *
 * Field ids MUST match the keys the runtime actually emits —
 * `CommercePrefetcher` (`dukafy/services/commerce_prefetcher.rb`) and
 * `CartPayload` (`dukafy/services/cart_payload.rb`). That agreement is not
 * assumed: `spec/publisher/commerce_entities_spec.rb` walks every field here
 * against a real payload and fails if one does not exist. Every
 * schema/payload drift in this codebase so far has failed SILENTLY — a
 * binding that quietly resolves to nothing — so it is checked, not trusted.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

/** How a value is rendered once bound. Mirrors `DynamicBindingFormat`. */
export type EntityFieldFormat = 'plain' | 'html' | 'url' | 'media'

export interface EntityScalarField {
  id: string
  label: string
  kind: 'scalar'
  format: EntityFieldFormat
  /**
   * Computed at render time by joining the entity against request state,
   * rather than read off the prefetched row. `spec/publisher/commerce_
   * entities_spec.rb` verifies these through an actual render instead of
   * against the prefetch payload, where they correctly do not appear.
   */
  derived?: boolean
}

export interface EntityListField {
  id: string
  label: string
  kind: 'list'
  /** The entity each item of this list is — what a loop over it yields. */
  of: EntityId
}

export type EntityField = EntityScalarField | EntityListField

export interface EntitySchema {
  id: EntityId
  label: string
  fields: EntityField[]
}

export type EntityId = 'product' | 'variant' | 'image' | 'imageVariant' | 'collection' | 'cartItem'

const scalar = (id: string, label: string, format: EntityFieldFormat = 'plain'): EntityScalarField =>
  ({ id, label, kind: 'scalar', format })
const list = (id: string, label: string, of: EntityId): EntityListField =>
  ({ id, label, kind: 'list', of })

/**
 * What the visitor's cart says about THIS entity — derived at render time by
 * joining the entity against the cart, not stored on it (see `with_cart_facts`
 * in `dukafy/publisher/render_page.rb`).
 *
 * These are what make a real add/update control possible out of plain nodes:
 * condition one node on `inCart is false` and another on `inCart is true`, and
 * bind the second's text to `cartQuantity`.
 *
 * Both are absent when no cart is in scope, which reads as falsy — so a baked
 * page shows the "not in cart" branch, then the cart region corrects it.
 */
const CART_FACTS: EntityScalarField[] = [
  { ...scalar('inCart', 'In cart?'), derived: true },
  { ...scalar('cartQuantity', 'Quantity in cart'), derived: true },
]

export const COMMERCE_ENTITIES: Record<EntityId, EntitySchema> = {
  product: {
    id: 'product',
    label: 'Product',
    fields: [
      scalar('title', 'Title'),
      scalar('slug', 'Slug'),
      scalar('href', 'Link', 'url'),
      scalar('descriptionHtml', 'Description', 'html'),
      scalar('imageUrl', 'Main image', 'media'),
      scalar('priceDisplay', 'Price'),
      scalar('priceCents', 'Price (cents)'),
      scalar('currency', 'Currency'),
      scalar('createdAt', 'Created at'),
      scalar('id', 'ID'),
      ...CART_FACTS,
      list('images', 'Images', 'image'),
      list('variants', 'Variants', 'variant'),
    ],
  },

  variant: {
    id: 'variant',
    label: 'Variant',
    fields: [
      scalar('title', 'Variant title'),
      scalar('sku', 'SKU'),
      scalar('priceDisplay', 'Price'),
      scalar('priceCents', 'Price (cents)'),
      scalar('currency', 'Currency'),
      scalar('stock', 'Stock'),
      scalar('position', 'Position'),
      scalar('id', 'ID'),
      ...CART_FACTS,
    ],
  },

  image: {
    id: 'image',
    label: 'Image',
    fields: [
      scalar('url', 'URL', 'media'),
      scalar('alt', 'Alt text'),
      scalar('width', 'Width'),
      scalar('height', 'Height'),
      // Responsive renditions — loopable, though the image module already
      // builds a srcset from them without anyone having to.
      list('variants', 'Renditions', 'imageVariant'),
    ],
  },

  imageVariant: {
    id: 'imageVariant',
    label: 'Rendition',
    fields: [
      scalar('path', 'Path', 'media'),
      scalar('width', 'Width'),
      scalar('height', 'Height'),
      scalar('format', 'Format'),
      scalar('sizeBytes', 'Size (bytes)'),
    ],
  },

  collection: {
    id: 'collection',
    label: 'Collection',
    fields: [
      scalar('title', 'Title'),
      scalar('slug', 'Slug'),
      scalar('description', 'Description'),
      scalar('id', 'ID'),
      list('products', 'Products', 'product'),
    ],
  },

  cartItem: {
    id: 'cartItem',
    label: 'Cart item',
    fields: [
      scalar('title', 'Product title'),
      scalar('variantTitle', 'Variant'),
      scalar('sku', 'SKU'),
      scalar('productSlug', 'Product slug'),
      scalar('href', 'Link', 'url'),
      scalar('imageUrl', 'Image', 'media'),
      scalar('quantity', 'Quantity'),
      scalar('unitPriceDisplay', 'Unit price'),
      scalar('unitPriceCents', 'Unit price (cents)'),
      scalar('linePriceDisplay', 'Line total'),
      scalar('linePriceCents', 'Line total (cents)'),
      scalar('currency', 'Currency'),
      scalar('stock', 'Stock'),
    ],
  },
}

export function entitySchema(id: EntityId): EntitySchema {
  return COMMERCE_ENTITIES[id]
}

/** Fields a loop can iterate — the `list` ones. */
export function listFields(id: EntityId): EntityListField[] {
  return COMMERCE_ENTITIES[id].fields.filter((f): f is EntityListField => f.kind === 'list')
}

/** Fields a value can bind to — the `scalar` ones. */
export function scalarFields(id: EntityId): EntityScalarField[] {
  return COMMERCE_ENTITIES[id].fields.filter((f): f is EntityScalarField => f.kind === 'scalar')
}

/**
 * Walk a dotted field path from an entity, returning the entity it lands on.
 * `product` + `images` → `image`. Returns null if the path leaves the schema,
 * which is how a stale binding on a renamed field is caught rather than
 * silently resolving to nothing.
 */
export function entityAtPath(from: EntityId, path: readonly string[]): EntityId | null {
  let current: EntityId = from
  for (const segment of path) {
    const field = COMMERCE_ENTITIES[current].fields.find((f) => f.id === segment)
    if (!field || field.kind !== 'list') return null
    current = field.of
  }
  return current
}
