/**
 * TypeBox response schemas for spotlight async providers.
 *
 * One schema per HTTP endpoint. Every provider passes its schema to
 * `apiRequest` (`@core/http`), which validates the response body so the
 * provider code never does `as Foo` past a JSON boundary.
 *
 * §3 of the master plan: TypeBox at every untyped boundary.
 */
import { Type } from '@core/utils/typeboxHelpers'

// ─── Media provider ───────────────────────────────────────────────────────────
// GET /admin/api/cms/media?query=<q>&limit=<n>

const MediaAssetSummarySchema = Type.Object(
  {
    id: Type.String(),
    filename: Type.String(),
    mimeType: Type.String(),
    sizeBytes: Type.Number(),
    publicPath: Type.String(),
    title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    deletedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: true },
)

export const MediaListResponseSchema = Type.Object(
  { assets: Type.Array(MediaAssetSummarySchema) },
  { additionalProperties: true },
)

// ─── Data tables provider ─────────────────────────────────────────────────────
// GET /admin/api/cms/data/tables?query=<q>&limit=<n>

const DataTableSummarySchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    slug: Type.String(),
    kind: Type.Optional(Type.String()),
    singularLabel: Type.Optional(Type.String()),
    pluralLabel: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
)

export const DataTablesListResponseSchema = Type.Object(
  { tables: Type.Array(DataTableSummarySchema) },
  { additionalProperties: true },
)

// ─── Content (data row) provider ─────────────────────────────────────────────
// GET /admin/api/cms/data/search?query=<q>&limit=<n>

const DataRowSearchEntrySchema = Type.Object(
  {
    id: Type.String(),
    tableId: Type.String(),
    tableSlug: Type.String(),
    tableName: Type.String(),
    slug: Type.String(),
    status: Type.String(),
    updatedAt: Type.String(),
  },
  { additionalProperties: true },
)

export const DataSearchResponseSchema = Type.Object(
  { entries: Type.Array(DataRowSearchEntrySchema) },
  { additionalProperties: true },
)

// ─── Plugins / plugin pages provider ─────────────────────────────────────────
// GET /admin/api/cms/plugins

const PluginAdminPageSummarySchema = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    navLabel: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    icon: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    route: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: true },
)

const InstalledPluginSummarySchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    enabled: Type.Boolean(),
    manifest: Type.Object(
      {
        adminPages: Type.Optional(Type.Array(PluginAdminPageSummarySchema)),
      },
      { additionalProperties: true },
    ),
  },
  { additionalProperties: true },
)

export const PluginsListResponseSchema = Type.Object(
  { plugins: Type.Array(InstalledPluginSummarySchema) },
  { additionalProperties: true },
)
