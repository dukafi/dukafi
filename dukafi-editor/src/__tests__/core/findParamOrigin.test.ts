/**
 * findParamOrigin.test.ts — Phase 3 data-layer tests
 *
 * Tests for findParamOrigin from src/core/visualComponents/origin.ts.
 * This is a pure function — no store needed.
 *
 * Architecture source: Contribution #619 §2
 *
 * Gates:
 *   FPO-1 — finds propBindings origin for a regular param
 *   FPO-2 — finds slot-outlet node for a slot param
 *   FPO-3 — returns null for orphan paramId (no node binds it)
 *   FPO-4 — finds binding on the rootNode itself
 *   FPO-5 — returns null when paramId not in vc.params
 */

import { describe, it, expect } from 'bun:test'
import { findParamOrigin } from '@core/visualComponents'
import type { VisualComponent, VCNode, VCParam } from '@core/visualComponents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVCNode(
  id: string,
  moduleId: string,
  opts: {
    props?: Record<string, unknown>
    propBindings?: Record<string, { paramId: string }>
    children?: string[]
  } = {},
): VCNode {
  return {
    id,
    moduleId,
    props: opts.props ?? {},
    breakpointOverrides: {},
    children: opts.children ?? [],
    classIds: [],
    propBindings: opts.propBindings,
  }
}

function makeParam(
  id: string,
  name: string,
  type: VCParam['type'],
): VCParam {
  return {
    id,
    name,
    type,
    defaultValue: '',
    required: false,
  }
}

/** Build a flat-tree VisualComponent from an array of VCNodes. */
function makeVC(
  rootId: string,
  nodes: VCNode[],
  params: VCParam[],
): VisualComponent {
  const nodesMap: Record<string, VCNode> = {}
  for (const n of nodes) nodesMap[n.id] = n
  return {
    id: 'vc-test',
    name: 'TestVC',
    tree: { nodes: nodesMap, rootNodeId: rootId },
    params,
    breakpoints: [],
    classIds: [],
    createdAt: 1000,
  }
}

// ---------------------------------------------------------------------------
// Gate FPO-1 — finds propBindings origin for a regular param
// ---------------------------------------------------------------------------

describe('Gate FPO-1 — finds propBindings origin for regular param', () => {
  it('returns { nodeId: child2.id, propKey: "text" } when child2 binds the param', () => {
    const param = makeParam('p1', 'title', 'string')

    const child1 = makeVCNode('child-1', 'base.text')
    const child2 = makeVCNode('child-2', 'base.text', {
      propBindings: { text: { paramId: 'p1' } },
    })
    const rootNode = makeVCNode('root', 'base.container', {
      children: ['child-1', 'child-2'],
    })

    const vc = makeVC('root', [rootNode, child1, child2], [param])
    const result = findParamOrigin(vc, 'p1')

    expect(result).not.toBeNull()
    expect(result!.nodeId).toBe('child-2')
    expect(result!.propKey).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// Gate FPO-2 — finds slot-outlet node for a slot param
// ---------------------------------------------------------------------------

describe('Gate FPO-2 — finds slot-outlet node for a slot param', () => {
  it('returns { nodeId: slotOutlet.id, propKey: "slotName" } for a slot param', () => {
    const slotParam = makeParam('p-slot', 'children', 'slot')

    const slotOutlet = makeVCNode('slot-outlet-node', 'base.slot-outlet', {
      props: { slotName: 'children' },
    })
    const rootNode = makeVCNode('root', 'base.container', {
      children: ['slot-outlet-node'],
    })

    const vc = makeVC('root', [rootNode, slotOutlet], [slotParam])
    const result = findParamOrigin(vc, 'p-slot')

    expect(result).not.toBeNull()
    expect(result!.nodeId).toBe('slot-outlet-node')
    expect(result!.propKey).toBe('slotName')
  })
})

// ---------------------------------------------------------------------------
// Gate FPO-3 — returns null for orphan paramId (no node binds it)
// ---------------------------------------------------------------------------

describe('Gate FPO-3 — returns null for orphan paramId', () => {
  it('returns null when the param exists but no node has a binding for it', () => {
    const orphanParam = makeParam('p-orphan', 'orphan', 'string')

    // Nodes with no propBindings
    const child = makeVCNode('child-a', 'base.text')
    const rootNode = makeVCNode('root', 'base.container', {
      children: ['child-a'],
    })

    const vc = makeVC('root', [rootNode, child], [orphanParam])
    const result = findParamOrigin(vc, 'p-orphan')

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Gate FPO-4 — finds binding on the rootNode itself
// ---------------------------------------------------------------------------

describe('Gate FPO-4 — finds binding on the rootNode itself', () => {
  it('returns rootNode.id when rootNode has the propBinding', () => {
    const param = makeParam('p-root', 'text', 'string')

    const rootNode = makeVCNode('root', 'base.text', {
      propBindings: { text: { paramId: 'p-root' } },
    })

    const vc = makeVC('root', [rootNode], [param])
    const result = findParamOrigin(vc, 'p-root')

    expect(result).not.toBeNull()
    expect(result!.nodeId).toBe('root')
    expect(result!.propKey).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// Gate FPO-5 — returns null when paramId not in vc.params
// ---------------------------------------------------------------------------

describe('Gate FPO-5 — returns null when paramId not in vc.params', () => {
  it('returns null for a completely nonexistent paramId', () => {
    // VC with one param that doesn't match the queried id
    const param = makeParam('p-real', 'realParam', 'string')
    const rootNode = makeVCNode('root', 'base.container', {
      propBindings: { text: { paramId: 'p-real' } },
    })

    const vc = makeVC('root', [rootNode], [param])
    const result = findParamOrigin(vc, 'p-nonexistent')

    expect(result).toBeNull()
  })

  it('returns null for an empty string paramId', () => {
    const param = makeParam('p1', 'label', 'string')
    const rootNode = makeVCNode('root', 'base.container', {
      propBindings: { label: { paramId: 'p1' } },
    })

    const vc = makeVC('root', [rootNode], [param])
    const result = findParamOrigin(vc, '')

    expect(result).toBeNull()
  })
})
