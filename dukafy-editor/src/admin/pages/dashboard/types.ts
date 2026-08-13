/**
 * Shared types for the Commerce workspace.
 *
 * No API client imports — shared across the page shell, the section
 * components, and the data hook.
 */
import type { ReactNode } from 'react'

export type CommerceSection = 'products' | 'collections' | 'orders' | 'plugins' | 'import' | 'settings'

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

export interface OrderItem {
  id: number
  sku: string
  productTitle: string
  variantTitle: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}

/**
 * A merchant-defined form filed against this order (delivery details, an
 * M-Pesa confirmation, whatever they invented). `payload` is deliberately
 * open — Dukafy never chose its shape, so it can't type it.
 */
export interface OrderSubmission {
  id: number
  formId: string
  payload: Record<string, string>
  createdAt: string
}

export interface Order {
  id: number
  status: string
  currency: string
  email: string | null
  phone: string | null
  customerId: number | null
  customerName: string | null
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  submissions: OrderSubmission[]
}

export const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'shipped', 'refunded'] as const

/**
 * One configurable field a plugin declared. The admin form is generated from
 * these, so a new plugin gets its settings UI with no UI code of its own.
 *
 * `value` is null for secrets — they are write-only over the API, so the form
 * can report that one is set but never prefill it.
 */
export interface PluginSettingField {
  key: string
  label: string
  type: string
  secret: boolean
  isSet: boolean
  value: string | null
}

export interface Plugin {
  id: string
  name: string
  version: string
  configured: boolean
  paymentProviders: string[]
  settings: PluginSettingField[]
}
