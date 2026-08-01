/**
 * findEnclosingComponentRef.test.ts
 *
 * Unit tests for the canvas selection utility that resolves which page-level
 * base.visual-component-ref "owns" a clicked node inside an inlined VC tree.
 *
 * Architecture source: Phase 4 component system (F4).
 */

import { describe, it, expect } from 'bun:test'
import {
  findEnclosingComponentRef,
  type AnnotatedPageNode,
} from '@site/canvas/canvasSelectionUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  opts: {
    owningRefId?: string
    fromSlotContent?: boolean
    moduleId?: string
  } = {},
): AnnotatedPageNode {
  return {
    id,
    moduleId: opts.moduleId ?? 'base.text',
    props: {},
    breakpointOverrides: {},
    children: [],
    classIds: [],
    _owningRefId: opts.owningRefId,
    _fromSlotContent: opts.fromSlotContent,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findEnclosingComponentRef', () => {
  // ── Null cases ─────────────────────────────────────────────────────────────

  it('returns null for a plain page node (no _owningRefId annotation)', () => {
    const nodes = { 'n1': makeNode('n1') }
    expect(findEnclosingComponentRef(nodes, 'n1')).toBeNull()
  })

  it('returns null for an unknown node id', () => {
    expect(findEnclosingComponentRef({}, 'unknown')).toBeNull()
  })

  it('returns null for a ref node that is itself a plain page node', () => {
    // The ref node placed on the page has no _owningRefId
    const nodes = {
      'ref1': makeNode('ref1', { moduleId: 'base.visual-component-ref' }),
    }
    expect(findEnclosingComponentRef(nodes, 'ref1')).toBeNull()
  })

  // ── VC body node ───────────────────────────────────────────────────────────

  it('returns refId with isInsideSlotContent: false for a VC body node', () => {
    const nodes = {
      'ref1': makeNode('ref1', { moduleId: 'base.visual-component-ref' }),
      'vc-body-node': makeNode('vc-body-node', { owningRefId: 'ref1', fromSlotContent: false }),
    }
    const result = findEnclosingComponentRef(nodes, 'vc-body-node')
    expect(result).toEqual({ refId: 'ref1', isInsideSlotContent: false })
  })

  // ── Slot content node ──────────────────────────────────────────────────────

  it('returns refId with isInsideSlotContent: true for a slot content node', () => {
    const nodes = {
      'ref1': makeNode('ref1', { moduleId: 'base.visual-component-ref' }),
      'slot-node': makeNode('slot-node', { owningRefId: 'ref1', fromSlotContent: true }),
    }
    const result = findEnclosingComponentRef(nodes, 'slot-node')
    expect(result).toEqual({ refId: 'ref1', isInsideSlotContent: true })
  })

  // ── Nested VC case ─────────────────────────────────────────────────────────

  it('resolves to the outermost page-level ref when VCs are nested', () => {
    // Layout:
    //   page
    //   └─ ref-vc1  (plain page node — places VC1)
    //       └─ ref-vc2  (_owningRefId: 'ref-vc1', _fromSlotContent: false — VC1 body)
    //           └─ deep-node  (_owningRefId: 'ref-vc2', _fromSlotContent: false — VC2 body)
    //
    // Clicking deep-node should resolve to ref-vc1 (the outermost page ref).

    const nodes = {
      'ref-vc1': makeNode('ref-vc1', { moduleId: 'base.visual-component-ref' }),
      'ref-vc2': makeNode('ref-vc2', {
        moduleId: 'base.visual-component-ref',
        owningRefId: 'ref-vc1',
        fromSlotContent: false,
      }),
      'deep-node': makeNode('deep-node', { owningRefId: 'ref-vc2', fromSlotContent: false }),
    }

    const result = findEnclosingComponentRef(nodes, 'deep-node')
    expect(result).toEqual({ refId: 'ref-vc1', isInsideSlotContent: false })
  })

  it('does not walk up further for a slot content node inside a nested VC', () => {
    // Slot content nodes are user-editable at the IMMEDIATE ref level.
    // Even if ref-vc2 is itself inside VC1, slot content of ref-vc2 returns
    // ref-vc2 as the enclosing ref (not ref-vc1).
    const nodes = {
      'ref-vc1': makeNode('ref-vc1', { moduleId: 'base.visual-component-ref' }),
      'ref-vc2': makeNode('ref-vc2', {
        moduleId: 'base.visual-component-ref',
        owningRefId: 'ref-vc1',
        fromSlotContent: false,
      }),
      'slot-content-node': makeNode('slot-content-node', {
        owningRefId: 'ref-vc2',
        fromSlotContent: true,
      }),
    }

    const result = findEnclosingComponentRef(nodes, 'slot-content-node')
    expect(result).toEqual({ refId: 'ref-vc2', isInsideSlotContent: true })
  })

  it('handles single-level nesting correctly', () => {
    // ref-vc1 is on the page; inner-node is in VC1's body.
    const nodes = {
      'ref-vc1': makeNode('ref-vc1', { moduleId: 'base.visual-component-ref' }),
      'inner-node': makeNode('inner-node', { owningRefId: 'ref-vc1', fromSlotContent: false }),
    }

    const result = findEnclosingComponentRef(nodes, 'inner-node')
    expect(result).toEqual({ refId: 'ref-vc1', isInsideSlotContent: false })
  })
})
