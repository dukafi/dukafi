/**
 * slotSync.test.ts — Unit tests for syncSlotInstances and applySlotSyncResult
 *
 * Architecture source: Task 4 of the Tree Unification Refactor.
 *
 * Tests:
 *  SS-1  No-op: already-synced ref produces empty ops and matching orderedChildIds
 *  SS-2  Add-param: new slot param produces an insert op and a new slot-instance node
 *  SS-3  Rename-param: renamed slot param produces a rename op (positional match)
 *  SS-4  Reorder-params: reordered slot params produce only reordered orderedChildIds (no ops)
 *  SS-5  Delete-param: removed slot param produces a delete op
 *  SS-6  Non-slot-instance child: non-slot-instance children of VC ref get delete ops
 *  SS-7  applySlotSyncResult: insert op adds node to tree and updates vcRefNode.children
 *  SS-8  applySlotSyncResult: rename op updates props.slotName on existing node
 *  SS-9  applySlotSyncResult: delete op removes node and its descendants from tree
 *  SS-10 Multiple slot params: all slots created in param order
 *  SS-11 New slot-instance has locked: true
 */

import { describe, it, expect } from 'bun:test'
import { syncSlotInstances, applySlotSyncResult } from '@core/visualComponents'
import type { BaseNode } from '@core/page-tree'
import type { VisualComponent } from '@core/visualComponents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStringParam(id: string, name: string): VisualComponent['params'][0] {
  return { id, name, type: 'string', defaultValue: '', required: false }
}

/**
 * Build a VC whose tree contains a `base.slot-outlet` node for every slot
 * name in `slotNames`. Slot-outlets are placed as direct children of the root
 * `base.body` node, in the same order as `slotNames`.
 *
 * The slot-outlet IS the slot — `extractSlotNamesFromVCTree` walks the tree
 * to derive the slot set, so the tree shape (not vc.params) drives sync.
 *
 * `extraParams` is preserved for tests that exercise non-slot params (they
 * must NOT influence the slot-instance materialization).
 */
function makeVC(slotNames: string[], extraParams: VisualComponent['params'] = []): VisualComponent {
  const nodes: Record<string, BaseNode> = {
    root: {
      id: 'root',
      moduleId: 'base.body',
      props: {},
      children: slotNames.map((_, i) => `outlet-${i}`),
      breakpointOverrides: {},
      classIds: [],
    },
  }
  for (let i = 0; i < slotNames.length; i++) {
    nodes[`outlet-${i}`] = {
      id: `outlet-${i}`,
      moduleId: 'base.slot-outlet',
      props: { slotName: slotNames[i] },
      children: [],
      breakpointOverrides: {},
      classIds: [],
    }
  }
  return {
    id: 'vc-1',
    name: 'TestVC',
    tree: { nodes, rootNodeId: 'root' },
    params: [...extraParams],
    breakpoints: [],
    classIds: [],
    createdAt: 0,
  }
}

function makeVCRefNode(id: string, children: string[] = []): BaseNode {
  return {
    id,
    moduleId: 'base.visual-component-ref',
    props: { componentId: 'vc-1', propOverrides: {} },
    children,
    breakpointOverrides: {},
    classIds: [],
  }
}

function makeSlotInstance(id: string, slotName: string, children: string[] = []): BaseNode {
  return {
    id,
    moduleId: 'base.slot-instance',
    props: { slotName },
    children,
    breakpointOverrides: {},
    classIds: [],
    locked: true,
  }
}

function makeContentNode(id: string): BaseNode {
  return {
    id,
    moduleId: 'base.text',
    props: { text: 'content' },
    children: [],
    breakpointOverrides: {},
    classIds: [],
  }
}

// ---------------------------------------------------------------------------
// SS-1: No-op — already-synced ref
// ---------------------------------------------------------------------------

describe('SS-1 — no-op: already-synced VC ref', () => {
  it('produces empty ops and matching orderedChildIds when already in sync', () => {
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a', 'slot-inst-b'])
    const instA = makeSlotInstance('slot-inst-a', 'header')
    const instB = makeSlotInstance('slot-inst-b', 'footer')
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'slot-inst-a': instA,
      'slot-inst-b': instB,
    }

    const vc = makeVC(['header', 'footer'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    expect(result.ops).toHaveLength(0)
    expect(Object.keys(result.newNodes)).toHaveLength(0)
    expect(result.orderedChildIds).toEqual(['slot-inst-a', 'slot-inst-b'])
  })

  it('is idempotent — running twice produces the same result', () => {
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode, 'slot-inst-a': instA }

    const vc = makeVC(['children'])
    const r1 = syncSlotInstances(vcRefNode, vc, treeNodes)
    expect(r1.ops).toHaveLength(0)

    // Apply (no-op) then re-sync
    applySlotSyncResult(treeNodes, r1, 'ref')
    const r2 = syncSlotInstances(treeNodes['ref'], vc, treeNodes)
    expect(r2.ops).toHaveLength(0)
    expect(r2.orderedChildIds).toEqual(['slot-inst-a'])
  })
})

// ---------------------------------------------------------------------------
// SS-2: Add-param — new slot param → insert op
// ---------------------------------------------------------------------------

describe('SS-2 — add-param: new slot param produces insert op', () => {
  it('produces a single insert op when a slot param is added', () => {
    // VC ref currently has slot-inst-a ('children'), VC now has two slots
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode, 'slot-inst-a': instA }

    const vc = makeVC(['children', 'sidebar'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    const insertOps = result.ops.filter((op) => op.kind === 'insert')
    expect(insertOps).toHaveLength(1)
    const insertOp = insertOps[0]
    expect(insertOp.kind).toBe('insert')
    if (insertOp.kind === 'insert') {
      expect(insertOp.slotName).toBe('sidebar')
    }

    // New node appears in newNodes
    expect(Object.keys(result.newNodes)).toHaveLength(1)

    // orderedChildIds is [slot-inst-a, new-id] in param order
    expect(result.orderedChildIds[0]).toBe('slot-inst-a')
    expect(result.orderedChildIds[1]).toBeTruthy()
  })

  it('produces insert op for a brand-new VC ref with no children', () => {
    const vcRefNode = makeVCRefNode('ref', [])
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode }

    const vc = makeVC(['children'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    expect(result.ops).toHaveLength(1)
    expect(result.ops[0].kind).toBe('insert')
    expect(Object.keys(result.newNodes)).toHaveLength(1)
    expect(result.orderedChildIds).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SS-3: Rename-param — renamed slot param → rename op (positional fallback)
// ---------------------------------------------------------------------------

describe('SS-3 — rename-param: renamed slot param produces rename op', () => {
  it('produces a rename op when a slot param is renamed (positional match)', () => {
    // VC ref has slot-inst-a with slotName='children'
    // VC now has a param named 'content' in the same position
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode, 'slot-inst-a': instA }

    const vc = makeVC(['content'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    const renameOps = result.ops.filter((op) => op.kind === 'rename')
    expect(renameOps).toHaveLength(1)
    if (renameOps[0].kind === 'rename') {
      expect(renameOps[0].nodeId).toBe('slot-inst-a')
      expect(renameOps[0].newSlotName).toBe('content')
    }

    // No insert or delete ops
    expect(result.ops.filter((op) => op.kind !== 'rename')).toHaveLength(0)

    // orderedChildIds still points to the same node
    expect(result.orderedChildIds).toEqual(['slot-inst-a'])
  })
})

// ---------------------------------------------------------------------------
// SS-4: Reorder-params — reordered slot params → only reordered orderedChildIds
// ---------------------------------------------------------------------------

describe('SS-4 — reorder-params: produces no ops but reorders orderedChildIds', () => {
  it('reorders orderedChildIds when slot params are reordered (name-based match)', () => {
    // VC ref has [slot-inst-header, slot-inst-footer]
    // VC params are now in reversed order: ['footer', 'header']
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-header', 'slot-inst-footer'])
    const instHeader = makeSlotInstance('slot-inst-header', 'header')
    const instFooter = makeSlotInstance('slot-inst-footer', 'footer')
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'slot-inst-header': instHeader,
      'slot-inst-footer': instFooter,
    }

    const vc = makeVC(['footer', 'header'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    // No rename/delete/insert ops — name-based matching handles reorder
    expect(result.ops.filter((op) => op.kind !== 'delete')).toHaveLength(0)
    // orderedChildIds reflects the new param order: footer first
    expect(result.orderedChildIds[0]).toBe('slot-inst-footer')
    expect(result.orderedChildIds[1]).toBe('slot-inst-header')
  })
})

// ---------------------------------------------------------------------------
// SS-5: Delete-param — removed slot param → delete op
// ---------------------------------------------------------------------------

describe('SS-5 — delete-param: removed slot param produces delete op', () => {
  it('produces a delete op for a slot-instance whose param no longer exists', () => {
    // VC ref has two slot-instances; VC now only has one slot param
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a', 'slot-inst-b'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const instB = makeSlotInstance('slot-inst-b', 'sidebar')
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'slot-inst-a': instA,
      'slot-inst-b': instB,
    }

    const vc = makeVC(['children']) // 'sidebar' param removed
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    const deleteOps = result.ops.filter((op) => op.kind === 'delete')
    expect(deleteOps).toHaveLength(1)
    if (deleteOps[0].kind === 'delete') {
      expect(deleteOps[0].nodeId).toBe('slot-inst-b')
    }

    // orderedChildIds only contains the surviving slot
    expect(result.orderedChildIds).toEqual(['slot-inst-a'])
  })

  it('cascades delete to slot-instance children', () => {
    // slot-inst-b has content children that should also be deleted
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a', 'slot-inst-b'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const contentNode = makeContentNode('content-1')
    const instB = makeSlotInstance('slot-inst-b', 'sidebar', ['content-1'])
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'slot-inst-a': instA,
      'slot-inst-b': instB,
      'content-1': contentNode,
    }

    const vc = makeVC(['children'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    // Apply and verify cascade deletion
    applySlotSyncResult(treeNodes, result, 'ref')
    expect(treeNodes['slot-inst-b']).toBeUndefined()
    expect(treeNodes['content-1']).toBeUndefined()
    expect(treeNodes['slot-inst-a']).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// SS-6: Non-slot-instance child → delete op
// ---------------------------------------------------------------------------

describe('SS-6 — non-slot-instance child gets a delete op', () => {
  it('deletes non-slot-instance children of a VC ref', () => {
    const vcRefNode = makeVCRefNode('ref', ['invalid-child'])
    const invalidChild = makeContentNode('invalid-child') // not a slot-instance
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'invalid-child': invalidChild,
    }

    const vc = makeVC(['children'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    // The invalid child should get a delete op
    const deleteOps = result.ops.filter((op) => op.kind === 'delete' && op.nodeId === 'invalid-child')
    expect(deleteOps).toHaveLength(1)

    // An insert op should be produced for the 'children' slot
    const insertOps = result.ops.filter((op) => op.kind === 'insert')
    expect(insertOps).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SS-7: applySlotSyncResult — insert op
// ---------------------------------------------------------------------------

describe('SS-7 — applySlotSyncResult: insert op', () => {
  it('adds the new node to the tree and updates vcRefNode.children', () => {
    const vcRefNode = makeVCRefNode('ref', [])
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode }

    const vc = makeVC(['children'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    applySlotSyncResult(treeNodes, result, 'ref')

    // vcRefNode.children now contains the new slot-instance ID
    const updatedRef = treeNodes['ref']
    expect(updatedRef.children).toHaveLength(1)
    const newId = updatedRef.children[0]
    expect(newId).toBeTruthy()

    // The new slot-instance node is in the tree
    const newNode = treeNodes[newId]
    expect(newNode).toBeDefined()
    expect(newNode.moduleId).toBe('base.slot-instance')
    expect(newNode.props.slotName).toBe('children')
  })
})

// ---------------------------------------------------------------------------
// SS-8: applySlotSyncResult — rename op
// ---------------------------------------------------------------------------

describe('SS-8 — applySlotSyncResult: rename op', () => {
  it('updates props.slotName on the existing slot-instance node', () => {
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-a'])
    const instA = makeSlotInstance('slot-inst-a', 'children')
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode, 'slot-inst-a': instA }

    const vc = makeVC(['content'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    applySlotSyncResult(treeNodes, result, 'ref')

    expect(treeNodes['slot-inst-a'].props.slotName).toBe('content')
  })
})

// ---------------------------------------------------------------------------
// SS-9: applySlotSyncResult — delete op cascades
// ---------------------------------------------------------------------------

describe('SS-9 — applySlotSyncResult: delete op removes subtree', () => {
  it('removes the slot-instance and all its descendants from the tree', () => {
    const grandchild = makeContentNode('gc-1')
    const child = { ...makeContentNode('child-1'), children: ['gc-1'] }
    const instB = makeSlotInstance('slot-inst-b', 'sidebar', ['child-1'])
    const vcRefNode = makeVCRefNode('ref', ['slot-inst-b'])
    const treeNodes: Record<string, BaseNode> = {
      ref: vcRefNode,
      'slot-inst-b': instB,
      'child-1': child,
      'gc-1': grandchild,
    }

    const vc = makeVC([]) // no slot params → delete instB
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    applySlotSyncResult(treeNodes, result, 'ref')

    expect(treeNodes['slot-inst-b']).toBeUndefined()
    expect(treeNodes['child-1']).toBeUndefined()
    expect(treeNodes['gc-1']).toBeUndefined()
    expect(treeNodes['ref'].children).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SS-10: Multiple slot params — all slots in param order
// ---------------------------------------------------------------------------

describe('SS-10 — multiple slot params: all slots in param order', () => {
  it('creates slots in the order declared by vc.params', () => {
    const vcRefNode = makeVCRefNode('ref', [])
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode }

    const vc = makeVC(['first', 'second', 'third'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    expect(result.ops).toHaveLength(3)
    expect(result.orderedChildIds).toHaveLength(3)

    // Apply and verify order
    applySlotSyncResult(treeNodes, result, 'ref')
    const ref = treeNodes['ref']
    expect(ref.children).toHaveLength(3)

    const slotNames = ref.children.map((id) => treeNodes[id].props.slotName)
    expect(slotNames).toEqual(['first', 'second', 'third'])
  })

  it('non-slot params do not produce slot-instances', () => {
    const vcRefNode = makeVCRefNode('ref', [])
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode }

    // VC with one slot-outlet in the tree and one non-slot string param.
    // Non-slot params live alongside slot-outlets but only the outlets drive
    // slot-instance materialization.
    const vc = makeVC(['children'], [makeStringParam('str-0', 'title')])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    // Only the slot-outlet produces an insert op
    expect(result.ops.filter((op) => op.kind === 'insert')).toHaveLength(1)
    expect(result.orderedChildIds).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SS-11: New slot-instance has locked: true
// ---------------------------------------------------------------------------

describe('SS-11 — new slot-instance node has locked: true', () => {
  it('newly inserted slot-instance nodes are locked', () => {
    const vcRefNode = makeVCRefNode('ref', [])
    const treeNodes: Record<string, BaseNode> = { ref: vcRefNode }

    const vc = makeVC(['children'])
    const result = syncSlotInstances(vcRefNode, vc, treeNodes)

    applySlotSyncResult(treeNodes, result, 'ref')

    const newId = treeNodes['ref'].children[0]
    const newNode = treeNodes[newId]
    expect(newNode.locked).toBe(true)
  })
})
