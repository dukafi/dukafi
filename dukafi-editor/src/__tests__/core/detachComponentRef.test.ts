/**
 * detachComponentRef — turn one instance into an ordinary page section.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import type { SiteDocument } from '@core/page-tree'
import type { VisualComponent } from '@core/visualComponents'
import '@modules/base/index'

function freshStore() {
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
    activeDocument: null,
    activePageId: null,
    inlineEditingRefId: null,
  })
  return useEditorStore.getState()
}

describe('detachComponentRef', () => {
  beforeEach(() => {
    freshStore()
    useEditorStore.getState().createSite('Detach Test')
  })

  it('replaces the instance with a lookalike section that is no longer linked', () => {
    const pageId = useEditorStore.getState().activePageId!
    useEditorStore.getState().setActiveDocument({ kind: 'page', pageId })

    const vcId = useEditorStore.getState().createVisualComponent('Newsletter form')
    const vc = useEditorStore.getState().site!.visualComponents.find((row) => row.id === vcId)!
    const body = vc.tree.nodes[vc.tree.rootNodeId]
    const textId = 'news-text'
    useEditorStore.getState().addNodeToVc(vcId, body.id, {
      id: textId,
      moduleId: 'base.text',
      props: { text: 'Join the list', tag: 'p' },
      children: [],
      breakpointOverrides: {},
      classIds: [],
    })

    const page = useEditorStore.getState().site!.pages.find((row) => row.id === pageId)!
    const refId = useEditorStore.getState().insertComponentRef(page.rootNodeId, vcId)!
    expect(useEditorStore.getState().site!.pages.find((row) => row.id === pageId)!.nodes[refId]?.moduleId)
      .toBe('base.visual-component-ref')

    const detachedId = useEditorStore.getState().detachComponentRef(refId)
    expect(detachedId).toBeTruthy()

    const next = useEditorStore.getState().site as SiteDocument & { visualComponents: VisualComponent[] }
    const nextPage = next.pages.find((row) => row.id === pageId)!
    expect(nextPage.nodes[refId]).toBeUndefined()
    expect(nextPage.nodes[detachedId!]?.moduleId).toBe('base.text')
    expect(nextPage.nodes[detachedId!]?.props.text).toBe('Join the list')
    expect(next.visualComponents.find((row) => row.id === vcId)).toBeDefined()
  })
})
