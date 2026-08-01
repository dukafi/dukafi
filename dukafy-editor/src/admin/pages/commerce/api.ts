/**
 * Commerce workspace API client.
 *
 * Thin typed wrapper around `/admin/api/cms/commerce`. Every mutation may
 * trigger a dependency-aware partial rebake server-side (see
 * `docs/architecture/publishing.md`) — callers don't need to know that, they
 * just get the updated row back.
 */
import type { Collection, Product, Variant } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/admin/api/cms/commerce${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message || `Request failed (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}

export interface ProductInput {
  title: string
  slug: string
  vendor: string
  status: string
  descriptionHtml: string
}

export interface VariantInput {
  sku: string
  title: string
  priceCents: number
  stock: number
  position: number
  currency?: string
}

export interface CollectionInput {
  title: string
  slug: string
  description: string
  sortOrder: number
}

export const commerceApi = {
  listProducts: () => request<{ products: Product[] }>('/products'),
  createProduct: (input: ProductInput) =>
    request<{ product: Product }>('/products', { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id: number, input: ProductInput) =>
    request<{ product: Product }>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteProduct: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),

  createVariant: (productId: number, input: VariantInput) =>
    request<{ variant: Variant }>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify({ currency: 'USD', ...input }),
    }),
  updateVariant: (productId: number, variantId: number, input: VariantInput) =>
    request<{ variant: Variant }>(`/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ currency: 'USD', ...input }),
    }),
  deleteVariant: (productId: number, variantId: number) =>
    request<void>(`/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),

  listCollections: () => request<{ collections: Collection[] }>('/collections'),
  createCollection: (input: CollectionInput) =>
    request<{ collection: Collection }>('/collections', { method: 'POST', body: JSON.stringify(input) }),
  updateCollection: (id: number, input: CollectionInput) =>
    request<{ collection: Collection }>(`/collections/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteCollection: (id: number) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
  setCollectionMembers: (id: number, productIds: number[]) =>
    request<{ collection: Collection }>(`/collections/${id}/products`, {
      method: 'PUT',
      body: JSON.stringify({ productIds }),
    }),

  importCsv: async (file: File) => {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/admin/api/cms/commerce/import', {
      method: 'POST',
      credentials: 'same-origin',
      body,
    })
    const result = await response.json().catch(() => null) as
      | { products?: number; variants?: number; error?: { message?: string } }
      | null
    if (!response.ok) throw new Error(result?.error?.message || 'Import failed')
    return { products: result?.products ?? 0, variants: result?.variants ?? 0 }
  },
}
