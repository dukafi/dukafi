/**
 * Shared types for the Commerce workspace.
 *
 * No API client imports — shared across the page shell, the section
 * components, and the data hook.
 */
import type { ReactNode } from 'react'

export type CommerceSection =
  | 'products' | 'collections' | 'tables' | 'orders' | 'discounts' | 'forms' | 'plugins' | 'import' | 'reviews'
  | 'connect' | 'settings'

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

export interface CatalogueFieldDef {
  key: string
  label: string
  type: string
  pluginId: string
}

export interface CatalogueField {
  key: string
  label: string
  value: string
  pluginId: string
}

export interface Variant {
  id: number
  sku: string
  title: string
  priceCents: number
  currency: string
  stock: number
  position: number
  fields: Record<string, string | number | boolean>
  fieldList: CatalogueField[]
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
  fields: Record<string, string | number | boolean>
  fieldList: CatalogueField[]
}

export interface Collection {
  id: number
  title: string
  slug: string
  description: string
  sortOrder: number
  productIds: number[]
}

export type DataColumnType = 'text' | 'longText' | 'number' | 'boolean' | 'url' | 'media'

export interface DataColumn {
  id: string
  label: string
  type: DataColumnType
}

export interface DataTable {
  id: number
  name: string
  slug: string
  columns: DataColumn[]
  rowCount: number
  rows?: DataRow[]
}

export interface DataRow {
  id: number
  slug: string
  position: number
  cells: Record<string, unknown>
  /** Baked loop entry — media columns are public URLs, not asset ids. */
  entry?: Record<string, unknown>
}

export interface VariantFormState {
  sku: string
  title: string
  priceCents: string
  stock: string
  position: string
  fields: Record<string, string>
}

export const emptyVariantForm: VariantFormState = {
  sku: '',
  title: '',
  priceCents: '0',
  stock: '0',
  position: '0',
  fields: {},
}

export function variantFormFrom(variant: Variant): VariantFormState {
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(variant.fields || {})) fields[key] = String(value)
  return {
    sku: variant.sku,
    title: variant.title,
    priceCents: String(variant.priceCents),
    stock: String(variant.stock),
    position: String(variant.position),
    fields,
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
 * open — Dukafi never chose its shape, so it can't type it.
 */
export interface OrderSubmission {
  id: number
  formId: string
  payload: Record<string, string>
  createdAt: string
}

/**
 * One attempt to pay. The failures matter as much as the success: a merchant
 * chasing "the customer says they paid" needs to see what the provider
 * refused and why, not just whether the order ended up marked paid.
 */
export interface OrderPayment {
  id: number
  provider: string
  status: string
  amountCents: number
  currency: string
  receipt: string
  reference: string
  error: string
  createdAt: string | null
  updatedAt: string | null
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
  payments: OrderPayment[]
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

export interface CataloguePlugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  licensed: boolean
  installed: boolean
  purchaseUrl: string
  homepage: string
  license: string
  logo: string
  images: string[]
}

export interface CataloguePage {
  plugins: CataloguePlugin[]
  total: number
  limit: number
  offset: number
}

export interface CatalogueQuery {
  q?: string
  category?: string
  licensed?: boolean
  limit?: number
  offset?: number
}

export interface Plugin {
  id: string
  name: string
  version: string
  configured: boolean
  paymentProviders: string[]
  productFields: CatalogueFieldDef[]
  variantFields: CatalogueFieldDef[]
  settings: PluginSettingField[]
  pages?: PluginDashboardPage[]
}

export interface PluginDashboardPage {
  id: string
  title: string
  navLabel: string
  description: string | null
  stats: { id: string; label: string }[]
  info: { id: string; label: string }[]
  tables: PluginDashboardTable[]
  actions: PluginDashboardAction[]
}

export interface PluginDashboardTable {
  id: string
  label: string
  empty: string
  columns: { key: string; label: string }[]
}

export interface PluginDashboardAction {
  id: string
  label: string
  kind: 'primary' | 'secondary' | 'danger'
  confirm: string | null
}

export interface PluginDashboardData {
  pluginId: string
  pageId: string
  stats: Record<string, { value: string; hint: string | null; tone: 'default' | 'good' | 'warn' | 'bad' }>
  info: Record<string, { value: string }>
}

export interface PluginDashboardTablePage {
  pluginId: string
  pageId: string
  tableId: string
  columns: { key: string; label: string }[]
  empty: string
  rows: Record<string, string | number | boolean | null>[]
  total: number
  limit: number
  offset: number
}

export interface PluginDashboardActionResult {
  ok: boolean
  pluginId: string
  pageId: string
  actionId: string
  message: string
  reload: boolean
}

/** One form the site has received something through, newest activity first. */
export interface FormSummary {
  id: string
  count: number
  lastAt: string | null
}

/**
 * One submission. `fields` is whatever the merchant's own inputs were named —
 * schemaless by design, so there is no fixed set of columns to render.
 */
export interface FormSubmission {
  id: number
  createdAt: string | null
  fields: Record<string, unknown>
  orderId: number | null
  customerId: number | null
}

export interface ThemeContents {
  pages: number
  templates: number
  partials: number
  tables: number
  forms: number
  products: number
  collections: number
  reviews: number
  media: number
}

export interface ThemeSummary {
  id: string
  name: string
  description?: string
  version: string
  sourceOrigin: string
  contents: ThemeContents
}

export interface ThemeMediaRef {
  id: number
  path: string
  url: string
  filename: string
  mimeType: string
  altText: string
  title: string
  caption: string
  tags: string[]
}

export interface ThemeInspect {
  theme: ThemeSummary
  media: ThemeMediaRef[]
  archive?: string
}

export interface ThemeApplyOptions {
  overridePages: boolean
  tables: boolean
  forms: boolean
  products: boolean
  reviews: boolean
  design: boolean
  pages: boolean
  templates: boolean
}

export interface ThemeApplyResult {
  applied: Record<string, number>
  skipped: Record<string, number>
  mediaCopied: number
  note: string
}
