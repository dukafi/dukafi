/**
 * Pull the store document after an MCP writer finished, without a full
 * tab reload (which jumps the canvas) and without the "changed somewhere
 * else" toast (this tab asked for the write).
 */

import { cmsAdapter } from '@core/persistence/cms'
import { useEditorStore } from '@site/store/store'
import { recordSiteSeq } from './siteSyncSeq'

let skipAutosave = false

export function armSkipSiteAutosave(): void {
  skipAutosave = true
}

/** Persistence must not save the document we just loaded from the server. */
export function consumeSkipSiteAutosave(): boolean {
  if (!skipAutosave) return false
  skipAutosave = false
  return true
}

export async function refreshSiteFromServer(): Promise<void> {
  const store = useEditorStore.getState()
  const pageId = store.activePageId
  const { zoom, panX, panY } = store
  const root = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>('[data-testid="canvas-root"]')
  const scroll = root ? { left: root.scrollLeft, top: root.scrollTop } : null

  const result = await cmsAdapter.loadSite('default')
  if (!result) return

  armSkipSiteAutosave()
  recordSiteSeq(result.shellSeq)
  store.loadSite(result.site)
  const next = useEditorStore.getState()
  if (pageId && result.site.pages.some((page) => page.id === pageId)) {
    next.setActivePage(pageId)
  }
  next.setCanvasTransform(zoom, panX, panY)

  if (typeof requestAnimationFrame === 'undefined' || !scroll) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLElement>('[data-testid="canvas-root"]')
      if (!canvas) return
      canvas.scrollLeft = scroll.left
      canvas.scrollTop = scroll.top
    })
  })
}
