/**
 * Site-editor page-context adapter.
 *
 * Reads the active page, current document, and the two editor-only scalars
 * (`selectedNodeId`, `activeBreakpointId`) off the live store and delegates to
 * the pure `buildSiteAgentSnapshot`. This is the only *site-specific* piece of
 * the agent layer — wired in via `agentSliceConfig.site.ts`.
 *
 * Returns `undefined` when there is no active page/site; the chat handler then
 * falls back to its empty snapshot.
 */

import type { EditorStore } from '@site/store/types'
import { buildSiteAgentSnapshot, type SiteAgentSnapshot } from './siteAgentSnapshot'
import { documentRefForPage, type AgentDocumentRef } from '@core/ai'

export function buildCurrentPageContext(get: () => EditorStore): SiteAgentSnapshot | undefined {
  const state = get()
  const activePage =
    state.site?.pages.find((p) => p.id === state.activePageId) ?? state.site?.pages[0]
  if (!activePage || !state.site) return undefined
  const currentDocument = resolveCurrentDocument(state, activePage)
  return buildSiteAgentSnapshot(activePage, state.site, {
    selectedNodeId: state.selectedNodeId,
    activeBreakpointId: state.activeBreakpointId,
    currentDocument,
  })
}

function resolveCurrentDocument(state: EditorStore, activePage: NonNullable<EditorStore['site']>['pages'][number]): AgentDocumentRef {
  if (state.activeDocument?.kind === 'visualComponent') {
    return { type: 'visualComponent', id: state.activeDocument.vcId }
  }
  if (state.activeDocument?.kind === 'page') {
    const pageId = state.activeDocument.pageId
    const page = state.site?.pages.find((p) => p.id === pageId)
    if (page) return documentRefForPage(page)
  }
  return documentRefForPage(activePage)
}
