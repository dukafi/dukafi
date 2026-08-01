/**
 * useSiteEditorUrlSync — keeps the Site editor's open page in lockstep with the
 * browser URL, in both directions:
 *
 *   1. READ (once, after the site loads): selects the page named in the URL so
 *      a bookmark / shared link / hard refresh lands directly on that page.
 *   2. WRITE (ongoing): mirrors the active page's slug back into the URL so the
 *      address bar always reflects what's on the canvas.
 *
 * URL contract
 * ------------
 *   /admin/site                  → home page (slug `index`); the bare URL is the
 *                                  canonical home form, so no `?page` is written
 *                                  while the home page is active.
 *   /admin/site?page=<slug>      → opens the page with that slug.
 *
 * Incoming deep links from the Data workspace's "Open in Site editor" button
 * (see `handleOpenInSiteEditor` in `DataPage.tsx`) are also consumed once:
 *   /admin/site?table=pages&row=<rowId>       → openPageInCanvas(rowId)
 *   /admin/site?table=components&row=<rowId>  → setActiveDocument({ kind: 'visualComponent', vcId: rowId })
 * After consuming them, the WRITE sync normalizes the URL to the `?page=` form
 * (or strips it for the home page / VC mode) by clearing `table`/`row`.
 *
 * Shared URL plumbing (replaceState semantics, router-free) lives in
 * `@admin/lib/urlState`; this hook only maps editor-store state onto it.
 */
import { useEffect, useRef } from 'react'
import { isHomePage } from '@core/page-tree'
import { useInitialQueryParams, useUrlQuerySync } from '@admin/lib/urlState'
import { useEditorStore } from '@site/store/store'

interface UseSiteEditorUrlSyncOptions {
  /** When false, the hook does nothing. Pass `workspace === 'site'`. */
  enabled: boolean
  /** Set to `true` when the persistence load has completed. */
  loaded: boolean
}

export function useSiteEditorUrlSync({ enabled, loaded }: UseSiteEditorUrlSyncOptions): void {
  /** Whether we've consumed the initial URL for this mount already. */
  const appliedRef = useRef(false)
  const initialParams = useInitialQueryParams()

  // ── READ: consume the initial URL once, after the site has loaded. ─────────
  useEffect(() => {
    if (!enabled || !loaded) return
    if (appliedRef.current) return

    const store = useEditorStore.getState()
    const site = store.site
    if (!site) return
    appliedRef.current = true

    // Data-workspace deep link (`?table=…&row=…`) takes precedence — it carries
    // explicit row ids and can also target a visual component.
    const table = initialParams.get('table')
    const rowId = initialParams.get('row')
    if (table && rowId) {
      if (table === 'pages' && site.pages.some((p) => p.id === rowId)) {
        store.openPageInCanvas(rowId)
      } else if (table === 'components' && site.visualComponents.some((c) => c.id === rowId)) {
        store.setActiveDocument({ kind: 'visualComponent', vcId: rowId })
      }
      // The WRITE sync normalizes the URL after the selection settles.
      return
    }

    // Bookmarkable page link (`?page=<slug>`).
    const pageSlug = initialParams.get('page')
    if (pageSlug) {
      const page = site.pages.find((p) => p.slug === pageSlug)
      if (page) store.openPageInCanvas(page.id)
    }
  }, [enabled, loaded, initialParams])

  // ── WRITE: mirror the active page's slug into the URL. ─────────────────────
  // `null` while a visual component is active (VC mode is page-less) or when
  // the home page is active (the bare `/admin/site` is the canonical form).
  const activePageSlug = useEditorStore((s) => {
    if (!enabled) return null
    if (s.activeDocument?.kind === 'visualComponent') return null
    const page = s.site?.pages.find((p) => p.id === s.activePageId)
    if (!page || isHomePage(page)) return null
    return page.slug
  })

  // Clears the one-shot Data-workspace deep-link params (`table`/`row`) on the
  // first sync and keeps `?page=` current thereafter.
  useUrlQuerySync(
    { page: activePageSlug, table: null, row: null },
    { enabled: enabled && loaded },
  )
}
