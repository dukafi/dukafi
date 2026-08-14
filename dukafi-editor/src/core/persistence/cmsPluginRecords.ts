import { Type } from '@sinclair/typebox'
import { PluginRecordSchema, type PluginRecord, type PluginResource } from '@core/plugin-sdk'
import type { StorageListOptions } from '@core/plugin-sdk/storageSchemas'
import { apiRequest, type FetchLike } from '@core/http'

interface PluginRecordsPayload {
  resource?: PluginResource
  records?: PluginRecord[]
  totalCount?: number
}

// Envelope schemas. `record` is validated in full against the canonical
// `PluginRecordSchema` (source of truth in @core/plugin-sdk). `PluginResource`
// has no schema yet, so the list/resource envelope keeps the records as
// validated PluginRecord items while the resource key passes through as
// unknown and is cast at the call site. Surfaced by /audit-types.

const PluginRecordsEnvelope = Type.Object(
  {
    resource: Type.Optional(Type.Unknown()),
    records: Type.Optional(Type.Array(PluginRecordSchema)),
    totalCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: true },
)

const RecordEnvelope = Type.Object(
  { record: Type.Optional(PluginRecordSchema) },
  { additionalProperties: true },
)

function recordsPath(basePath: string, pluginId: string, resourceId: string): string {
  return `${basePath}/plugins/${encodeURIComponent(pluginId)}/resources/${encodeURIComponent(resourceId)}/records`
}

function buildQueryString(options?: StorageListOptions): string {
  if (!options) return ''
  const sp = new URLSearchParams()
  if (options.filter !== undefined) sp.set('filter', JSON.stringify(options.filter))
  if (options.orderBy !== undefined) sp.set('orderBy', JSON.stringify(options.orderBy))
  if (options.limit !== undefined) sp.set('limit', String(options.limit))
  if (options.offset !== undefined) sp.set('offset', String(options.offset))
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export async function listCmsPluginResourceRecords(
  pluginId: string,
  resourceId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
  options?: StorageListOptions,
): Promise<{ records: PluginRecord[]; totalCount: number }> {
  const url = recordsPath(basePath, pluginId, resourceId) + buildQueryString(options)
  const body = await apiRequest(url, {
    schema: PluginRecordsEnvelope,
    fetchImpl,
    fallbackMessage: 'CMS plugin records request failed',
  })
  const cast = body as PluginRecordsPayload
  return {
    records: Array.isArray(cast.records) ? cast.records : [],
    totalCount: typeof cast.totalCount === 'number' ? cast.totalCount : 0,
  }
}

export async function getCmsPluginResource(
  pluginId: string,
  resourceId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<{ resource: PluginResource; records: PluginRecord[]; totalCount: number }> {
  const body = await apiRequest(recordsPath(basePath, pluginId, resourceId), {
    schema: PluginRecordsEnvelope,
    fetchImpl,
    fallbackMessage: 'CMS plugin resource request failed',
  })
  const cast = body as PluginRecordsPayload
  if (!cast.resource) throw new Error('CMS plugin resource response was missing resource')
  return {
    resource: cast.resource,
    records: Array.isArray(cast.records) ? cast.records : [],
    totalCount: typeof cast.totalCount === 'number' ? cast.totalCount : 0,
  }
}

export async function createCmsPluginResourceRecord(
  pluginId: string,
  resourceId: string,
  data: Record<string, unknown>,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<PluginRecord> {
  const body = await apiRequest(recordsPath(basePath, pluginId, resourceId), {
    method: 'POST',
    body: { data },
    schema: RecordEnvelope,
    fetchImpl,
    fallbackMessage: 'CMS plugin record create failed',
  })
  if (!body.record) throw new Error('CMS plugin record create response was missing record')
  return body.record
}

export async function updateCmsPluginResourceRecord(
  pluginId: string,
  resourceId: string,
  recordId: string,
  data: Record<string, unknown>,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<PluginRecord> {
  const body = await apiRequest(`${recordsPath(basePath, pluginId, resourceId)}/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: { data },
    schema: RecordEnvelope,
    fetchImpl,
    fallbackMessage: 'CMS plugin record update failed',
  })
  if (!body.record) throw new Error('CMS plugin record update response was missing record')
  return body.record
}

export async function deleteCmsPluginResourceRecord(
  pluginId: string,
  resourceId: string,
  recordId: string,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  basePath = '/admin/api/cms',
): Promise<void> {
  await apiRequest(`${recordsPath(basePath, pluginId, resourceId)}/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    fetchImpl,
    fallbackMessage: 'CMS plugin record delete failed',
  })
}
