/**
 * No-op mutation contract.
 *
 * Store actions that semantically do nothing must not create undo history,
 * mark the document dirty, or bump `site.updatedAt`. This keeps autosave,
 * save indicators, and Cmd-Z aligned with real document changes.
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import { makeNode, makePage, makeSite, makeVC, makeVCNode } from '../fixtures'

function freshStore(): void {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

function loadContractSite(): void {
  const page = makePage({
    id: 'page-1',
    rootNodeId: 'root',
    nodes: {
      root: makeNode({ id: 'root', moduleId: 'base.body', children: ['text-1'] }),
      'text-1': makeNode({ id: 'text-1', moduleId: 'base.text', props: { text: 'Hello' } }),
    },
  })
  const vc = makeVC({
    id: 'vc-card',
    name: 'Card',
    tree: {
      rootNodeId: 'vc-root',
      nodes: {
        'vc-root': makeVCNode({ id: 'vc-root', moduleId: 'base.container' }),
      },
    },
  })

  useEditorStore.getState().loadSite(
    makeSite({
      pages: [page],
      visualComponents: [vc],
      breakpoints: [
        { id: 'desktop', label: 'Desktop', minWidth: 1024 },
        { id: 'mobile', label: 'Mobile', minWidth: 0 },
      ],
      updatedAt: 123_456,
    }),
  )
}

function expectNoDocumentMutation(action: () => void): void {
  const beforeState = useEditorStore.getState()
  const beforeSite = structuredClone(beforeState.site)
  const beforeHistoryLength = beforeState._historyPast.length
  const beforeCanUndo = beforeState.canUndo
  const beforeDirty = beforeState.hasUnsavedChanges
  const beforeUpdatedAt = beforeState.site?.updatedAt

  action()

  const afterState = useEditorStore.getState()
  expect(afterState.site).toEqual(beforeSite)
  expect(afterState._historyPast).toHaveLength(beforeHistoryLength)
  expect(afterState.canUndo).toBe(beforeCanUndo)
  expect(afterState.hasUnsavedChanges).toBe(beforeDirty)
  expect(afterState.site?.updatedAt).toBe(beforeUpdatedAt)
}

describe('No-op mutation contract', () => {
  beforeEach(() => {
    freshStore()
    loadContractSite()
  })

  it('does not dirty history for no-op page mutations', () => {
    expectNoDocumentMutation(() => {
      useEditorStore.getState().reorderPages(0, 0)
    })

    expectNoDocumentMutation(() => {
      useEditorStore.getState().convertPageToTemplate('missing-page', {
        tableSlug: 'posts',
        priority: 0,
      })
    })
  })

  it('does not dirty history for no-op active-tree mutations', () => {
    expectNoDocumentMutation(() => {
      useEditorStore.getState().clearBreakpointOverride('text-1', 'mobile')
    })

    expectNoDocumentMutation(() => {
      useEditorStore.getState().clearNodeDynamicBinding('text-1', 'title')
    })
  })

  it('does not dirty history for no-op breakpoint and font mutations', () => {
    expectNoDocumentMutation(() => {
      useEditorStore.getState().removeBreakpoint('missing-breakpoint')
    })

    expectNoDocumentMutation(() => {
      useEditorStore.getState().removeFont('missing-font')
    })
  })

  it('does not dirty history for no-op Visual Component mutations', () => {
    expectNoDocumentMutation(() => {
      useEditorStore.getState().deleteVisualComponent('missing-vc')
    })

    expectNoDocumentMutation(() => {
      useEditorStore.getState().addNodeToVc(
        'vc-card',
        'missing-parent',
        makeVCNode({ id: 'new-node', moduleId: 'base.text' }),
      )
    })
  })

  it('does not dirty history for no-op framework mutations', () => {
    expectNoDocumentMutation(() => {
      useEditorStore.getState().updateFrameworkColorToken('missing-token', {
        slug: 'brand',
      })
    })

    expectNoDocumentMutation(() => {
      useEditorStore.getState().deleteFrameworkSpacingGroup('missing-group')
    })
  })
})
