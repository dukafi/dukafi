/**
 * Shared types for the Commerce workspace.
 *
 * Dialect-naive — no React imports, no API client imports. Shared across the
 * page shell, the section components, and the data hook.
 */

export type CommerceSection = 'products' | 'collections' | 'import'

export interface Variant {
  id: number
  sku: string
  title: string
  priceCents: number
  currency: string
  stock: number
  position: number
}

export interface Product {
  id: number
  title: string
  slug: string
  vendor: string
  status: 'draft' | 'active'
  descriptionHtml: string
  variants: Variant[]
}

export interface Collection {
  id: number
  title: string
  slug: string
  description: string
  sortOrder: number
  productIds: number[]
}

export interface VariantFormState {
  sku: string
  title: string
  priceCents: string
  stock: string
  position: string
}

export const emptyVariantForm: VariantFormState = {
  sku: '',
  title: '',
  priceCents: '0',
  stock: '0',
  position: '0',
}

export function variantFormFrom(variant: Variant): VariantFormState {
  return {
    sku: variant.sku,
    title: variant.title,
    priceCents: String(variant.priceCents),
    stock: String(variant.stock),
    position: String(variant.position),
  }
}
