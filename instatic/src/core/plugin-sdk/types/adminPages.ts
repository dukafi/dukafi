// ---------------------------------------------------------------------------
// Admin pages — registered by the manifest, rendered inside the admin shell
// ---------------------------------------------------------------------------

export interface PluginPin {
  label: string
  detail?: string
  x: number
  y: number
}

export type PluginPageContent =
  | {
    kind: 'markdown'
    heading?: string
    body: string
  }
  | {
    kind: 'map'
    heading: string
    body?: string
    centerLabel?: string
    pins: PluginPin[]
  }
  | {
    kind: 'resource'
    heading: string
    resource: string
  }
  | {
    kind: 'app'
    heading: string
    entry: string
    assetPath?: string
  }

export interface PluginAdminPage {
  id: string
  title: string
  navLabel?: string
  icon?: string
  /**
   * Optional admin route override. The host derives the final route from
   * the plugin id + page id at install time (`/admin/plugins/:pluginId/:pageId`),
   * so plugin authors never need to set it. Kept on the type for forward
   * compatibility (e.g. nested plugin pages).
   */
  route?: string
  content: PluginPageContent
}

// `PluginPageSummarySchema` was deleted alongside the `api.cms.pages.*`
// surface. Plugins now reach the equivalent via
// `api.cms.content.table('pages').list({ status: 'published' })`, which
// returns full `ContentEntry` shapes (see `contentSchemas.ts`).
