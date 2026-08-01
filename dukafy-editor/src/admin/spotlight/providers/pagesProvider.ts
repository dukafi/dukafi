/**
 * Pages provider — live page search from the editor store (Phase 3).
 *
 * LOCAL provider: reads site.pages synchronously from useEditorStore.getState().
 * No HTTP call, no debounce (debounceMs: 0).
 *
 * Replaces the Phase 2 dynamic command iteration in pagesScope: this provider
 * is the single source of truth for page search, whether the user is in the
 * pages scope or typing in the root palette.
 */

import type { SpotlightProvider, Command } from '../types'

const MAX_RESULTS = 25

export const pagesProvider: SpotlightProvider = {
  id: 'pages',
  label: 'Pages',
  debounceMs: 0,

  search(query, _ctx, signal): Command[] {
    if (signal.aborted) return []

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEditorStore } = require('@site/store/store') as typeof import('@site/store/store')
      const state = useEditorStore.getState()
      const { site, activePageId } = state
      if (!site) return []

      const q = query.toLowerCase()
      const pages = q
        ? site.pages.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              (p.slug && p.slug.toLowerCase().includes(q)),
          )
        : site.pages

      return pages.slice(0, MAX_RESULTS).map((page): Command => ({
        id: `page:${page.id}`,
        title: page.title,
        subtitle: page.slug ? `/${page.slug}` : undefined,
        group: 'pages',
        iconName: page.template ? 'layout-solid' : 'file-text-solid',
        keywords: ['page', 'navigate', page.slug ?? ''],
        workspaces: ['site'],
        priorityBoost: activePageId === page.id ? 1.5 : 1.0,
        run: async (ctx) => {
          ctx.closeSpotlight()
          try {
            const { useEditorStore: store } = await import('@site/store/store')
            store.getState().openPageInCanvas(page.id)
          } catch (err) {
            console.error('[spotlight:pages] openPageInCanvas failed:', err)
          }
        },
      }))
    } catch {
      return []
    }
  },
}
