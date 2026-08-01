/**
 * Shared types for the Commerce workspace.
 *
 * No API client imports — shared across the page shell, the section
 * components, and the data hook.
 */
import type { ReactNode } from 'react'

export type CommerceSection = 'products' | 'collections' | 'import' | 'settings'

export interface CommerceSettings {
  currency: string
  lowStockThreshold: number
}

export interface RowActionMenuItem {
  label: string
  icon: ReactNode
  danger?: boolean
  onSelect: () => void
}

export interface Variant {
  id: number
  sku: string
  title: string
  priceCents: number
  currency: string
  stock: number
  position: number
}

export interface ProductImage {
  id: number
  publicPath: string
  width: number | null
  height: number | null
}

export interface Product {
  id: number
  title: string
  slug: string
  vendor: string
  status: 'draft' | 'active'
  descriptionHtml: string
  variants: Variant[]
  images: ProductImage[]
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
