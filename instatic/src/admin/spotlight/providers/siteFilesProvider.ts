/**
 * Site files provider — searches site.files from the editor store.
 *
 * LOCAL provider, 0 ms debounce.
 *
 * Surfaces site files (CSS, JS, assets, components, etc.) for opening in the
 * code editor panel via the `codeEditorScope`. Each result calls
 * `openInEditor(fileId)` which sets activeEditorFileId and shows the panel.
 */

import type { SpotlightProvider, Command } from '../types'

const MAX_RESULTS = 25

const FILE_TYPE_ICONS: Record<string, string> = {
  style: 'code',
  script: 'code',
  component: 'puzzle-piece-solid',
  asset: 'image-solid',
  config: 'gear-solid',
  doc: 'document-solid',
}

export const siteFilesProvider: SpotlightProvider = {
  id: 'siteFiles',
  label: 'Site files',
  debounceMs: 0,

  search(query, _ctx, signal): Command[] {
    if (signal.aborted) return []

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEditorStore } = require('@site/store/store') as typeof import('@site/store/store')
      const state = useEditorStore.getState()
      const { site } = state
      if (!site) return []

      const q = query.toLowerCase()
      const files = q
        ? site.files.filter(
            (f) =>
              f.path.toLowerCase().includes(q) ||
              f.type.toLowerCase().includes(q),
          )
        : site.files

      return files.slice(0, MAX_RESULTS).map((file): Command => {
        const filename = file.path.split('/').pop() ?? file.path

        return {
          id: `siteFile:${file.id}`,
          title: filename,
          subtitle: file.path !== filename ? file.path : file.type,
          group: 'editor',
          iconName: FILE_TYPE_ICONS[file.type] ?? 'document-solid',
          keywords: ['file', file.type, file.path],
          workspaces: ['site'],
          run: async (ctx) => {
            ctx.closeSpotlight()
            try {
              const { useEditorStore: store } = await import('@site/store/store')
              store.getState().openInEditor(file.id)
            } catch (err) {
              console.error('[spotlight:siteFiles] openInEditor failed:', err)
            }
          },
        }
      })
    } catch {
      return []
    }
  },
}
