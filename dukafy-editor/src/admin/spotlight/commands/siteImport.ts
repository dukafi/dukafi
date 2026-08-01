/**
 * Site Import command — open the Super Import wizard from the Spotlight palette.
 *
 * Capability gate mirrors editor.save: any user who holds at least one
 * site-write capability can use this command.
 */

import type { Command } from '../types'

/** Mirrors SITE_WRITE_CAPABILITIES in editor.ts — any holder can import a site. */
const SITE_WRITE_CAPABILITIES = [
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
] as const

export function getSiteImportCommands(): Command[] {
  return [
    {
      id: 'editor.importSite',
      title: 'Import Site',
      subtitle: 'Import pages or CMS bundles from files, folders, or .zip archives',
      group: 'editor',
      iconName: 'files-stack-2-solid',
      keywords: ['import', 'site', 'zip', 'folder', 'bundle', 'json', 'cms', 'html', 'css'],
      workspaces: ['any'],
      capability: SITE_WRITE_CAPABILITIES,
      run: async (ctx) => {
        ctx.closeSpotlight()
        // Lazy import keeps the tiny admin UI store out of the static command
        // registry and avoids loading the modal chunk until the shell mount sees
        // the flag flip.
        const { useAdminUi } = await import('@admin/state/adminUi')
        useAdminUi.getState().openSiteImport()
      },
    },
  ]
}
