/**
 * slotInstanceLockdown.test.ts
 *
 * Pure unit tests for `resolveDomDropTarget` verifying the slot-instance
 * structural lock-down rules from Task 5 of the Tree Unification Refactor.
 *
 * Fixture tree:
 *   root (base.body)
 *   ├─ vcRef (base.visual-component-ref)
 *   │   ├─ slot1 (base.slot-instance, locked, slotName: 'children')
 *   │   │   └─ textInside (base.text)
 *   │   └─ slot2 (base.slot-instance, locked, slotName: 'actions')
 *   └─ outsideText (base.text)
 */

import { describe, expect, it } from 'bun:test'
import type { Page, PageNode } from '@core/page-tree'
import { resolveDomDropTarget } from '@site/panels/DomPanel/domPanelDnd'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(
  id: string,
  moduleId: string,
  children: string[] = [],
  locked = false,
  props: Record<string, unknown> = {},
): PageNode {
  return {
    id,
    moduleId,
    props,
    breakpointOverrides: {},
    children,
    locked,
    classIds: [],
  }
}

function page(nodes: Record<string, PageNode>, rootNodeId = 'root'): Page {
  return {
    id: 'page',
    slug: 'index',
    title: 'Home',
    rootNodeId,
    nodes,
  }
}

// Stub: these module IDs accept children
const canHaveChildren = (moduleId: string): boolean =>
  ['base.body', 'base.container', 'base.visual-component-ref', 'base.slot-instance'].includes(
    moduleId,
  )

// The fixture page
const testPage = page({
  root: node('root', 'base.body', ['vcRef', 'outsideText']),
  vcRef: node('vcRef', 'base.visual-component-ref', ['slot1', 'slot2']),
  slot1: node('slot1', 'base.slot-instance', ['textInside'], true, { slotName: 'children' }),
  textInside: node('textInside', 'base.text'),
  slot2: node('slot2', 'base.slot-instance', [], true, { slotName: 'actions' }),
  outsideText: node('outsideText', 'base.text'),
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('slot-instance structural lock-down — DnD constraints', () => {
  it('L1: dragging slot1 inside outsideText is rejected (slot-instance is locked)', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'slot1',
        overId: 'outsideText',
        zone: 'inside',
        canHaveChildren,
      }),
    ).toBeNull()
  })

  it('L2: dragging slot1 before slot2 (reorder under same VC ref) is rejected', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'slot1',
        overId: 'slot2',
        zone: 'before',
        canHaveChildren,
      }),
    ).toBeNull()
  })

  it('L3: dragging slot1 before outsideText (detach from VC ref parent) is rejected', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'slot1',
        overId: 'outsideText',
        zone: 'before',
        canHaveChildren,
      }),
    ).toBeNull()
  })

  it('L4: dragging outsideText before slot1 (sibling of slot-instance under VC ref) is rejected', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'outsideText',
        overId: 'slot1',
        zone: 'before',
        canHaveChildren,
      }),
    ).toBeNull()
  })

  it('L5: dragging outsideText inside vcRef (direct child of VC ref) is rejected', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'outsideText',
        overId: 'vcRef',
        zone: 'inside',
        canHaveChildren,
      }),
    ).toBeNull()
  })

  it('L6: dragging outsideText inside slot1 is allowed (slot content is editable)', () => {
    const result = resolveDomDropTarget({
      page: testPage,
      draggedId: 'outsideText',
      overId: 'slot1',
      zone: 'inside',
      canHaveChildren,
    })
    expect(result).not.toBeNull()
    expect(result?.parentId).toBe('slot1')
    expect(result?.draggedId).toBe('outsideText')
  })

  it('L7: dragging textInside before slot2 (direct sibling of slot-instance) is rejected', () => {
    expect(
      resolveDomDropTarget({
        page: testPage,
        draggedId: 'textInside',
        overId: 'slot2',
        zone: 'before',
        canHaveChildren,
      }),
    ).toBeNull()
  })
})
