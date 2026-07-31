/**
 * vcRefSlotInstanceIntegrity.test.ts — regression gates for two silent
 * slot-instance data-corruption bugs in the editor store.
 *
 * BUG 1 (insertComponentRef orphaned slot-instances on undo):
 *   insertComponentRef used to run in TWO Zustand mutations — the VC-ref node
 *   via `insertNode` (recorded one undo entry) and the slot-instance
 *   materialization via a separate raw `set()` (recorded NOTHING). On undo, the
 *   ref was reverted but its slot-instance children survived as orphans in the
 *   persisted node map. The fix collapses both into ONE mutateActiveTree recipe
 *   → one patch set → one undo entry. This test asserts the page node map
 *   returns to its EXACT baseline size after a single undo.
 *
 * BUG 2 (reconcileVCRefsForVc missed VC-to-VC refs):
 *   The post-mutation reconcile in the mutateActiveTree path only swept
 *   `site.pages`, so a ref to VC-B nested inside VC-A was skipped when VC-B's
 *   slot-outlet set changed from VC-canvas mode. The fix routes through
 *   `syncAllVCRefSlotInstances(allTreeNodeMaps(site), …)`, which covers pages
 *   AND every VC tree. This test edits VC-B's slot set while editing VC-B and
 *   asserts VC-A's nested ref is reconciled.
 */
import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import type { BaseNode } from '@core/page-tree'
import { makeSite, makePage, makeNode } from '../fixtures'
import '@modules/base/index'

function freshStore() {
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

const vcNode = (
  id: string,
  moduleId: string,
  children: string[] = [],
  props: Record<string, unknown> = {},
): BaseNode => ({
  id,
  moduleId,
  props,
  children,
  breakpointOverrides: {},
  classIds: [],
})

describe('VC-ref slot-instance integrity', () => {
  beforeEach(freshStore)

  it('Bug 1: undo after insertComponentRef restores the page node map to baseline (no orphan slot-instances)', () => {
    // VC with a single slot-outlet → dropping its ref materializes exactly one
    // slot-instance child, the node that used to leak on undo.
    const vc = {
      id: 'vc-1',
      name: 'HeroSection',
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': vcNode('vc-root', 'base.body', ['vc-outlet']),
          'vc-outlet': vcNode('vc-outlet', 'base.slot-outlet', [], { slotName: 'children' }),
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 0,
    }

    const page = makePage({
      id: 'p1',
      rootNodeId: 'root',
      nodes: { root: makeNode({ id: 'root', moduleId: 'base.body', children: [] }) },
    })
    const site = makeSite({ pages: [page], visualComponents: [vc] })

    useEditorStore.setState({
      site,
      activePageId: 'p1',
      activeDocument: null,
    } as Parameters<typeof useEditorStore.setState>[0])

    const baseline = Object.keys(useEditorStore.getState().site!.pages[0].nodes).length

    // Drop the VC ref — adds the ref AND its slot-instance child.
    const refId = useEditorStore.getState().insertComponentRef('root', 'vc-1')!
    expect(refId).toBeTruthy()

    const afterInsert = useEditorStore.getState().site!.pages[0].nodes
    const refNode = afterInsert[refId]
    expect(refNode.children).toHaveLength(1)
    expect(afterInsert[refNode.children[0]].moduleId).toBe('base.slot-instance')
    // ref + slot-instance landed.
    expect(Object.keys(afterInsert).length).toBe(baseline + 2)

    // ONE undo must revert BOTH the ref and the slot-instance.
    useEditorStore.getState().undo()

    const afterUndo = useEditorStore.getState().site!.pages[0].nodes
    expect(Object.keys(afterUndo).length).toBe(baseline)
    expect(afterUndo[refId]).toBeUndefined()
    // No orphan slot-instance left behind anywhere in the node map.
    expect(
      Object.values(afterUndo).some((n) => n.moduleId === 'base.slot-instance'),
    ).toBe(false)
  })

  it('Bug 2: editing VC-B slot-outlets reconciles a ref to VC-B nested inside VC-A', () => {
    // VC-B starts with NO slot-outlet.
    const vcB = {
      id: 'vc-b',
      name: 'VCB',
      tree: {
        rootNodeId: 'b-root',
        nodes: { 'b-root': vcNode('b-root', 'base.body', []) },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 0,
    }
    // VC-A nests a ref to VC-B. With VC-B slot-less, the ref has no slot-instance.
    const vcA = {
      id: 'vc-a',
      name: 'VCA',
      tree: {
        rootNodeId: 'a-root',
        nodes: {
          'a-root': vcNode('a-root', 'base.body', ['a-ref']),
          'a-ref': vcNode('a-ref', 'base.visual-component-ref', [], {
            componentId: 'vc-b',
            propOverrides: {},
          }),
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 0,
    }

    const site = makeSite({ pages: [makePage({ id: 'p1' })], visualComponents: [vcA, vcB] })

    // Edit VC-B in VC-canvas mode.
    useEditorStore.setState({
      site,
      activePageId: 'p1',
      activeDocument: { kind: 'visualComponent', vcId: 'vc-b' },
    } as Parameters<typeof useEditorStore.setState>[0])

    // Baseline: VC-A's nested ref has no slot-instance children yet.
    const refBefore = useEditorStore
      .getState()
      .site!.visualComponents.find((v) => v.id === 'vc-a')!.tree.nodes['a-ref']
    expect(refBefore.children).toHaveLength(0)

    // Add a slot-outlet to VC-B — this changes VC-B's slot set.
    const outletId = useEditorStore
      .getState()
      .insertNode('base.slot-outlet', { slotName: 'main' }, 'b-root')
    expect(outletId).toBeTruthy()

    // VC-A's nested ref to VC-B must now carry a materialized slot-instance.
    const vcAAfter = useEditorStore
      .getState()
      .site!.visualComponents.find((v) => v.id === 'vc-a')!
    const refAfter = vcAAfter.tree.nodes['a-ref']
    expect(refAfter.children).toHaveLength(1)
    const slotInst = vcAAfter.tree.nodes[refAfter.children[0]]
    expect(slotInst.moduleId).toBe('base.slot-instance')
    expect(slotInst.props.slotName).toBe('main')
  })
})
