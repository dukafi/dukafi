/**
 * Plugin pages provider — searches registered plugin admin pages.
 *
 * LOCAL-or-SERVER provider, 0 ms debounce (plugin list is small, cached by
 * the providerRunner's 30 s TTL so the HTTP call only fires once per palette
 * session on the first non-empty query).
 *
 * Calls GET /admin/api/cms/plugins which returns all installed plugins with
 * their manifest.adminPages. Only enabled plugins' pages are surfaced.
 */

import type { SpotlightProvider, Command } from '../types'
import { PluginsListResponseSchema } from './schemas'
import { MAX_RESULTS, fetchOnAbortEmpty } from './serverProvider'

// Unlike the other server providers, this endpoint takes no query param — the
// full plugin list is cheap, cached by the providerRunner, and filtered below.
const ENDPOINT = '/admin/api/cms/plugins'

export const pluginPagesProvider: SpotlightProvider = {
  id: 'pluginPages',
  label: 'Plugin pages',
  debounceMs: 150,

  async search(query, _ctx, signal): Promise<Command[]> {
    const body = await fetchOnAbortEmpty(ENDPOINT, PluginsListResponseSchema, signal)
    if (body === null) return []

    const q = query.toLowerCase()
    const results: Command[] = []

    for (const plugin of body.plugins) {
      if (!plugin.enabled) continue
      const pages = plugin.manifest.adminPages ?? []

      for (const page of pages) {
        const label = page.navLabel ?? page.title
        if (q && !label.toLowerCase().includes(q) && !plugin.name.toLowerCase().includes(q)) {
          continue
        }

        const route = page.route ?? `/admin/plugins/${plugin.id}/${page.id}`

        results.push({
          id: `pluginPage:${plugin.id}:${page.id}`,
          title: label,
          subtitle: plugin.name,
          group: 'plugins',
          iconName: 'puzzle-piece-solid',
          keywords: ['plugin', plugin.name, label, plugin.id],
          run: (ctx) => {
            ctx.closeSpotlight()
            ctx.navigate(route)
          },
        })

        if (results.length >= MAX_RESULTS) break
      }

      if (results.length >= MAX_RESULTS) break
    }

    return results
  },
}
