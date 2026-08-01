/**
 * Site Export command — open the Export dialog from the Spotlight palette.
 *
 * Gated by `data.export` (the same capability the export endpoint requires),
 * so it appears for any user allowed to download a site bundle. Available on
 * every workspace — exporting is not Data-workspace-specific.
 */

import type { Command } from '../types'

export function getSiteExportCommands(): Command[] {
  return [
    {
      id: 'data.exportSite',
      title: 'Export Site',
      subtitle: 'Download a full or partial site bundle — pages, media, folders, redirects',
      group: 'data',
      iconName: 'arrow-down',
      keywords: ['export', 'site', 'bundle', 'backup', 'download', 'json', 'migrate', 'transfer', 'snapshot'],
      workspaces: ['any'],
      capability: 'data.export',
      run: async (ctx) => {
        ctx.closeSpotlight()
        // Lazy import keeps the admin UI store out of the static command registry.
        const { useAdminUi } = await import('@admin/state/adminUi')
        useAdminUi.getState().openSiteExport()
      },
    },
  ]
}
