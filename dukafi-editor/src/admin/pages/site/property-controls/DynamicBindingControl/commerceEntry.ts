/**
 * Commerce `currentEntry` binding support for the DynamicBindingControl
 * picker.
 *
 * Products, variants, collections, and Dashboard Tables rows are first-class
 * store entities. They bake through `CommercePrefetcher` + `render_page.rb`'s
 * `resolve_dynamic_bindings` — not Instatic `core/loops` / `core/data`.
 * Custom tables loop as `data/<slug>`; column ids become `currentEntry.<id>`.
 *
 * This module is the editor-side counterpart: it tells the binding picker
 * which fields are available for `currentEntry.<field>` when the selected
 * node is (a) inside a `store.relationship-loop`, or (b) directly on a
 * product/collection template page (`ProductTemplate`/`CollectionTemplate`
 * in Ruby), plus a live preview value for each field so the picker shows
 * real data instead of blanks. Field ids MUST match the keys
 * `CommercePrefetcher`/`relationship_items` actually put on the hash — see
 * `dukafi/services/commerce_prefetcher.rb`. Table-specific columns are merged
 * in `usePropertiesPanelData` once the table list loads.
 */
import type { LoopSourceField } from '@core/loops/types'
import { commerceApi } from '@admin/pages/dashboard/api'

export type CommerceEntityKind = 'product' | 'variant' | 'collection' | 'dataRow'

export const COMMERCE_ENTITY_LABELS: Record<CommerceEntityKind, string> = {
  product: 'Product',
  variant: 'Variant',
  collection: 'Collection',
  dataRow: 'Data row',
}

export const COMMERCE_ENTITY_FIELDS: Record<CommerceEntityKind, LoopSourceField[]> = {
  product: [
    { id: 'title', label: 'Title', format: 'plain' },
    { id: 'priceDisplay', label: 'Price', format: 'plain' },
    { id: 'imageUrl', label: 'Image', format: 'media' },
    { id: 'href', label: 'Link', format: 'url' },
    { id: 'descriptionHtml', label: 'Description', format: 'html' },
  ],
  variant: [
    { id: 'title', label: 'Variant title', format: 'plain' },
    { id: 'priceDisplay', label: 'Price', format: 'plain' },
    { id: 'sku', label: 'SKU', format: 'plain' },
    { id: 'stock', label: 'Stock', format: 'plain' },
  ],
  collection: [
    { id: 'title', label: 'Title', format: 'plain' },
    { id: 'description', label: 'Description', format: 'plain' },
  ],
  dataRow: [
    { id: 'slug', label: 'Slug', format: 'plain' },
    { id: 'tableName', label: 'Table name', format: 'plain' },
  ],
}

function formatPriceCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

interface CommercePreviewCache {
  product: Record<string, unknown> | null
  variant: Record<string, unknown> | null
  collection: Record<string, unknown> | null
  dataRow: Record<string, unknown> | null
}

export let _cachedCommercePreview: CommercePreviewCache | null = null
let _commercePreviewPromise: Promise<CommercePreviewCache> | null = null

/** @internal - for test use only */
export function clearCommercePreviewCache(): void {
  _cachedCommercePreview = null
  _commercePreviewPromise = null
}

async function firstDataRowPreview(): Promise<Record<string, unknown> | null> {
  const tables = await commerceApi.listDataTables().then((result) => result.tables).catch(() => [])
  const table = tables.find((item) => item.rowCount > 0) ?? tables[0]
  if (!table) return null
  const detailed = await commerceApi.getDataTable(table.slug).catch(() => null)
  const row = detailed?.table.rows?.[0]
  if (!row) return null
  return row.entry ?? { slug: row.slug, tableName: table.name, tableSlug: table.slug, ...row.cells }
}

async function fetchCommercePreview(): Promise<CommercePreviewCache> {
  const [productsResult, collectionsResult, dataRow] = await Promise.all([
    commerceApi.listProducts().catch(() => ({ products: [] })),
    commerceApi.listCollections().catch(() => ({ collections: [] })),
    firstDataRowPreview(),
  ])
  const product = productsResult.products[0]
  const collection = collectionsResult.collections[0]
  const firstVariant = product?.variants[0]

  return {
    product: product
      ? {
        title: product.title,
        priceDisplay: firstVariant ? formatPriceCents(firstVariant.priceCents, firstVariant.currency) : '',
        imageUrl: product.images[0]?.publicPath ?? '',
        href: `/products/${product.slug}`,
        descriptionHtml: product.descriptionHtml,
      }
      : null,
    variant: firstVariant
      ? {
        title: firstVariant.title,
        priceDisplay: formatPriceCents(firstVariant.priceCents, firstVariant.currency),
        sku: firstVariant.sku,
        stock: String(firstVariant.stock),
      }
      : null,
    collection: collection
      ? {
        title: collection.title,
        description: collection.description,
      }
      : null,
    dataRow,
  }
}

/** Kicks off (or reuses) the single shared preview fetch; never rejects. */
export function loadCommercePreview(): Promise<CommercePreviewCache> {
  if (_cachedCommercePreview) return Promise.resolve(_cachedCommercePreview)
  if (_commercePreviewPromise) return _commercePreviewPromise
  _commercePreviewPromise = fetchCommercePreview()
    .then((result) => {
      _cachedCommercePreview = result
      _commercePreviewPromise = null
      return result
    })
    .catch(() => {
      _commercePreviewPromise = null
      const empty: CommercePreviewCache = { product: null, variant: null, collection: null, dataRow: null }
      return empty
    })
  return _commercePreviewPromise
}

export function commercePreviewItem(
  kind: CommerceEntityKind,
  cache: CommercePreviewCache | null,
): Record<string, unknown> | null {
  return cache?.[kind] ?? null
}
