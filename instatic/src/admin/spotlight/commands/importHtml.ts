/**
 * Import HTML command — open the paste-HTML modal from the Spotlight palette.
 *
 * Opens ImportHtmlModal with no pre-set parent (defaults to the page root)
 * and no prefill (the user types or pastes HTML in the modal's textarea).
 *
 * Capability gate mirrors editor.save: any user who holds at least one
 * site-write capability can use this command.
 */

import type { Command } from '../types'

/** Mirrors `SITE_WRITE_CAPABILITIES` in editor.ts — any holder can import HTML. */
const SITE_WRITE_CAPABILITIES = [
  'site.structure.edit',
  'site.content.edit',
  'site.style.edit',
] as const

export function getImportHtmlCommands(): Command[] {
  return [
    {
      id: 'editor.importHtml',
      title: 'Import HTML',
      subtitle: 'Parse HTML and insert as page nodes',
      group: 'editor',
      iconName: 'code',
      keywords: ['import', 'html', 'paste', 'code'],
      workspaces: ['site'],
      capability: SITE_WRITE_CAPABILITIES,
      run: async (ctx) => {
        ctx.closeSpotlight()
        // Lazy import to avoid dragging the editor store into non-site bundles.
        const { useEditorStore } = await import('@site/store/store')
        useEditorStore.getState().openImportHtmlModal()
      },
    },
  ]
}
