/**
 * Commerce workspace API client.
 *
 * Thin typed wrapper around `/admin/api/cms/commerce`. Every mutation may
 * trigger a dependency-aware partial rebake server-side (see
 * `docs/architecture/publishing.md`) — callers don't need to know that, they
 * just get the updated row back.
 */
import type {
  Collection, CommerceSettings, FormSubmission, FormSummary, Order,
  CataloguePage, CatalogueQuery, Plugin, PluginDashboardActionResult,
  PluginDashboardData, PluginDashboardPage, PluginDashboardTablePage,
  Product, Variant,
  DataColumn, DataRow, DataTable,
} from './types'

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

async function requestAbsolute<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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
  status: string
  descriptionHtml: string
  fields?: Record<string, string>
}

export interface VariantInput {
  sku: string
  title: string
  priceCents: number
  stock: number
  position: number
  fields?: Record<string, string>
}

export interface CommerceSettingsInput {
  currency: string
  lowStockThreshold: number
}

export interface CollectionInput {
  title: string
  slug: string
  description: string
  sortOrder: number
}

export const commerceApi = {
  // Plugins are not commerce-specific, but the Commerce workspace is where
  // the first ones (payment providers) are configured. Path differs from the
  // rest of this client, hence the explicit leading `../`-style absolute call.
  listPlugins: () => requestAbsolute<{ plugins: Plugin[] }>('/admin/api/cms/plugins'),
  listCatalogue: (query: CatalogueQuery = {}) => {
    const params = new URLSearchParams()
    const q = query.q?.trim()
    if (q) params.set('q', q)
    if (query.category) params.set('category', query.category)
    if (query.licensed === true || query.licensed === false) params.set('licensed', String(query.licensed))
    params.set('limit', String(query.limit ?? 25))
    params.set('offset', String(query.offset ?? 0))
    return requestAbsolute<CataloguePage>(`/admin/api/cms/plugins/catalogue?${params}`)
  },
  installPlugin: (id: string) =>
    requestAbsolute<{ plugin: Plugin }>(`/admin/api/cms/plugins/install`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  // Form submissions. The payload is schemaless — the merchant named the
  // fields — so `fields` comes back as whatever arrived rather than a shape
  // this client can type in advance.
  listForms: () => requestAbsolute<{ forms: FormSummary[] }>('/admin/api/cms/forms'),
  listSubmissions: (formId: string, offset = 0) =>
    requestAbsolute<{
      formId: string
      submissions: FormSubmission[]
      total: number
      hasMore: boolean
    }>(`/admin/api/cms/forms/${encodeURIComponent(formId)}?offset=${offset}`),
  deleteSubmission: (formId: string, id: number) =>
    requestAbsolute<void>(`/admin/api/cms/forms/${encodeURIComponent(formId)}/${id}`, {
      method: 'DELETE',
    }),
  savePluginSettings: (id: string, settings: Record<string, string>) =>
    requestAbsolute<{ ok: boolean; configured: boolean }>(`/admin/api/cms/plugins/${id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),
  listPluginPages: (pluginId: string) =>
    requestAbsolute<{ pages: PluginDashboardPage[] }>(
      `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/pages`,
    ),
  getPluginPage: (pluginId: string, pageId: string) =>
    requestAbsolute<{ page: PluginDashboardPage }>(
      `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/pages/${encodeURIComponent(pageId)}`,
    ),
  getPluginPageData: (pluginId: string, pageId: string) =>
    requestAbsolute<PluginDashboardData>(
      `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/pages/${encodeURIComponent(pageId)}/data`,
    ),
  getPluginPageTable: (pluginId: string, pageId: string, tableId: string, query: { limit?: number; offset?: number; q?: string } = {}) => {
    const params = new URLSearchParams()
    if (query.limit != null) params.set('limit', String(query.limit))
    if (query.offset != null) params.set('offset', String(query.offset))
    if (query.q) params.set('q', query.q)
    const suffix = params.toString() ? `?${params}` : ''
    return requestAbsolute<PluginDashboardTablePage>(
      `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/pages/${encodeURIComponent(pageId)}/tables/${encodeURIComponent(tableId)}${suffix}`,
    )
  },
  runPluginPageAction: (pluginId: string, pageId: string, actionId: string, params: Record<string, string | number | boolean> = {}) =>
    requestAbsolute<PluginDashboardActionResult>(
      `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/pages/${encodeURIComponent(pageId)}/actions/${encodeURIComponent(actionId)}`,
      { method: 'POST', body: JSON.stringify({ params }) },
    ),
  deletePlugin: (id: string) =>
    requestAbsolute<void>(`/admin/api/cms/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exportPlugin: async (id: string, input: { name: string; version: string }) => {
    const response = await fetch(`/admin/api/cms/plugins/${encodeURIComponent(id)}/export`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message || `Request failed (${response.status})`)
    }
    const blob = await response.blob()
    const sha256 = response.headers.get('X-Checksum-Sha256') || ''
    const disposition = response.headers.get('Content-Disposition')
    const match = disposition?.match(/filename="([^"]+)"/)
    return {
      blob,
      sha256,
      filename: match?.[1] || `${id}-${input.version}.tar.gz`,
    }
  },

  listOrders: () => request<{ orders: Order[] }>('/orders'),
  updateOrderStatus: (id: number, status: string) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  listProducts: () => request<{ products: Product[] }>('/products'),
  createProduct: (input: ProductInput) =>
    request<{ product: Product }>('/products', { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id: number, input: ProductInput) =>
    request<{ product: Product }>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteProduct: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),

  createVariant: (productId: number, input: VariantInput) =>
    request<{ variant: Variant }>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateVariant: (productId: number, variantId: number, input: VariantInput) =>
    request<{ variant: Variant }>(`/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteVariant: (productId: number, variantId: number) =>
    request<void>(`/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
  setProductImages: (productId: number, mediaAssetIds: string[]) =>
    request<{ product: Product }>(`/products/${productId}/images`, {
      method: 'PUT',
      body: JSON.stringify({ mediaAssetIds }),
    }),
  setProductOgImage: (productId: number, mediaAssetId: number | null) =>
    request<{ product: Product }>(`/products/${productId}/og-image`, {
      method: 'PUT',
      body: JSON.stringify({ mediaAssetId }),
    }),
  setProductCollections: (productId: number, collectionIds: number[]) =>
    request<{ collectionIds: number[] }>(`/products/${productId}/collections`, {
      method: 'PUT',
      body: JSON.stringify({ collectionIds }),
    }),

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
  setCollectionImage: (id: number, mediaAssetId: string | null) =>
    request<{ collection: Collection }>(`/collections/${id}/image`, {
      method: 'PUT',
      body: JSON.stringify({ mediaAssetId }),
    }),

  listDataTables: () => request<{ tables: DataTable[] }>('/tables'),
  getDataTable: (idOrSlug: number | string) =>
    request<{ table: DataTable }>(`/tables/${encodeURIComponent(String(idOrSlug))}`),
  createDataTable: (input: { name: string; slug: string; columns: DataColumn[] }) =>
    request<{ table: DataTable }>('/tables', { method: 'POST', body: JSON.stringify(input) }),
  updateDataTable: (id: number, input: { name: string; slug: string; columns: DataColumn[] }) =>
    request<{ table: DataTable }>(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteDataTable: (id: number) => request<void>(`/tables/${id}`, { method: 'DELETE' }),
  createDataRow: (tableId: number, input: { slug?: string; position?: number; cells: Record<string, unknown> }) =>
    request<{ row: DataRow }>(`/tables/${tableId}/rows`, { method: 'POST', body: JSON.stringify(input) }),
  updateDataRow: (tableId: number, rowId: number, input: { slug?: string; position?: number; cells: Record<string, unknown> }) =>
    request<{ row: DataRow }>(`/tables/${tableId}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteDataRow: (tableId: number, rowId: number) =>
    request<void>(`/tables/${tableId}/rows/${rowId}`, { method: 'DELETE' }),

  getSettings: () => request<{ settings: CommerceSettings }>('/settings'),
  updateSettings: (input: CommerceSettingsInput) =>
    request<{ settings: CommerceSettings }>('/settings', { method: 'PATCH', body: JSON.stringify(input) }),

  getStoreProfile: () => requestAbsolute<{ profile: import('./types').StoreProfile }>('/admin/api/cms/store-profile'),
  updateStoreProfile: (input: { startedOn: string; audience: string; difference: string }) =>
    requestAbsolute<{ profile: import('./types').StoreProfile }>('/admin/api/cms/store-profile', {
      method: 'PUT',
      body: JSON.stringify(input),
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

async function themeError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
  throw new Error(body?.error?.message || `Request failed (${response.status})`)
}

export const themeApi = {
  exportTheme: async (include: Record<string, boolean>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(include)) params.set(key, value ? '1' : '0')
    const response = await fetch(`/admin/api/cms/themes/export?${params}`, { credentials: 'same-origin' })
    if (!response.ok) await themeError(response)
    const blob = await response.blob()
    const match = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)
    return { blob, filename: match?.[1] || 'theme.tar.gz' }
  },

  inspectFile: async (file: File) => {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/admin/api/cms/themes/inspect', { method: 'POST', credentials: 'same-origin', body })
    if (!response.ok) await themeError(response)
    return response.json() as Promise<import('./types').ThemeInspect>
  },

  defaultTheme: () =>
    requestAbsolute<{ theme: import('./types').ThemeSummary | null }>('/admin/api/cms/themes/default'),

  installTheme: (id: string) =>
    requestAbsolute<import('./types').ThemeInspect>('/admin/api/cms/themes/install', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  applyTheme: async (input: {
    file?: File
    archive?: string
    remap: { byId: Record<string, number>; byPath: Record<string, string> }
    options: import('./types').ThemeApplyOptions
  }) => {
    const response = input.file
      ? await fetch('/admin/api/cms/themes/apply', {
          method: 'POST',
          credentials: 'same-origin',
          body: (() => {
            const body = new FormData()
            body.append('file', input.file)
            body.append('remap', JSON.stringify(input.remap))
            body.append('options', JSON.stringify(input.options))
            return body
          })(),
        })
      : await fetch('/admin/api/cms/themes/apply', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archive: input.archive, remap: input.remap, options: input.options }),
        })
    if (!response.ok) await themeError(response)
    return response.json() as Promise<import('./types').ThemeApplyResult>
  },
}
