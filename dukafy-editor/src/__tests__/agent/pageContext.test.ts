import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import { buildCurrentPageContext } from '@site/agent'
import '@modules/base'

/**
 * The site-editor agent adapter now posts the RAW authoritative tree
 * (active page + site) as a `SiteAgentSnapshot`. The server derives modules,
 * tokens, classes, and the rendered HTML from it on demand — those derivations
 * are covered by readDocument.test.ts / agentTools.test.ts. Here we only assert
 * the browser adapter reads the live store correctly.
 */

function freshSite() {
  useEditorStore.setState({
    site: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    hasUnsavedChanges: false,
  })
  const state = useEditorStore.getState()
  const site = state.createSite('Agent Context')
  return site.pages[0]
}

beforeEach(() => {
  useEditorStore.setState({ activeBreakpointId: 'desktop' })
})

describe('buildCurrentPageContext', () => {
  const get = () => useEditorStore.getState()

  it('emits the active page (full nodes) plus the editor scalars', () => {
    const page = freshSite()
    useEditorStore.setState({ activePageId: page.id, selectedNodeId: page.rootNodeId })
    useEditorStore.getState().setActiveBreakpoint('mobile')

    const snap = buildCurrentPageContext(get)
    expect(snap).toBeDefined()
    expect(snap!.page.id).toBe(page.id)
    expect(snap!.page.nodes[page.rootNodeId]).toBeDefined()
    expect(snap!.currentDocument).toEqual({ type: 'page', id: page.id })
    expect(snap!.selectedNodeId).toBe(page.rootNodeId)
    expect(snap!.activeBreakpointId).toBe('mobile')
  })

  it('carries the site shell (breakpoints, styleRules, settings) for server derivation', () => {
    freshSite()
    const snap = buildCurrentPageContext(get)
    expect(snap).toBeDefined()
    expect(snap!.site.breakpoints.map((b) => b.id)).toEqual(['mobile', 'tablet', 'desktop'])
    expect(snap!.site.styleRules).toBeDefined()
    expect(snap!.site.settings).toBeDefined()
  })

  it('emits the active visual component as the current document without bloating pages', () => {
    const page = freshSite()
    const vcId = useEditorStore.getState().createVisualComponent('Card')
    useEditorStore.getState().setActiveDocument({ kind: 'visualComponent', vcId })

    const snap = buildCurrentPageContext(get)

    expect(snap).toBeDefined()
    expect(snap!.page.id).toBe(page.id)
    expect(snap!.currentDocument).toEqual({ type: 'visualComponent', id: vcId })
  })

  it('empties non-active pages\' nodes to bound the payload', () => {
    const page = freshSite()
    useEditorStore.getState().addPage('About', 'about')
    useEditorStore.setState({ activePageId: page.id })

    const snap = buildCurrentPageContext(get)
    expect(snap).toBeDefined()
    const active = snap!.site.pages.find((p) => p.id === page.id)!
    const other = snap!.site.pages.find((p) => p.id !== page.id)!
    expect(Object.keys(active.nodes).length).toBeGreaterThan(0)
    expect(Object.keys(other.nodes)).toEqual([])
  })

  it('returns undefined when there is no active site', () => {
    useEditorStore.setState({ site: null })
    expect(buildCurrentPageContext(get)).toBeUndefined()
  })
})
