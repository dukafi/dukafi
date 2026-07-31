/**
 * vcInstantiate.test.ts — Unit tests for instantiateVCAtRef
 *
 * Architecture source: Contribution #619 §8.5
 *
 * Tests:
 *  IT-1  Plain prop pass-through (no bindings)
 *  IT-2  Single propBinding with override (param.id key)
 *  IT-3  Single propBinding fallback to param.defaultValue
 *  IT-4  Multiple propBindings on one node
 *  IT-5  propBindings on non-root node
 *  IT-6  Slot outlet replaced with slot content nodes
 *  IT-7  Slot outlet kept as placeholder when no content provided
 *  IT-8  Slot outlet replaced with param defaultValue content
 *  IT-9  Empty slot content array falls back to param defaultValue
 *  IT-10 base.visual-component-ref nodes pass through unchanged
 *  IT-11 Root node ID is vc.tree.rootNodeId
 *  IT-12 All nodes appear in the flat output map
 *  IT-13 All emitted nodes carry _owningRefId annotation
 *  IT-14 VC body nodes are _fromSlotContent = false
 *  IT-15 Slot content nodes are _fromSlotContent = true
 *  IT-16 Slot outlet placeholder is _fromSlotContent = false
 */

import { describe, it, expect } from 'bun:test'
import { instantiateVCAtRef } from '@core/visualComponents'
import type { VisualComponent, VCNode } from '@core/visualComponents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal VCNode for tests */
function node(
  id: string,
  moduleId: string,
  props: Record<string, unknown> = {},
  opts: {
    propBindings?: Record<string, { paramId: string }>
    children?: string[]
    hidden?: boolean
  } = {},
): VCNode {
  return {
    id,
    moduleId,
    props,
    breakpointOverrides: {},
    children: opts.children ?? [],
    classIds: [],
    propBindings: opts.propBindings,
    hidden: opts.hidden,
  }
}

/** Build a flat-tree VisualComponent for tests. Pass ALL nodes (root + descendants). */
function vc(
  id: string,
  nodes: VCNode[],
  rootId: string,
  params: VisualComponent['params'] = [],
): VisualComponent {
  const nodesMap: Record<string, VCNode> = {}
  for (const n of nodes) nodesMap[n.id] = n
  return {
    id,
    name: 'TestVC',
    tree: { nodes: nodesMap, rootNodeId: rootId },
    params,
    breakpoints: [],
    classIds: [],
    createdAt: 1000,
  }
}

const TEST_REF_ID = 'page-ref-node-id'

// ---------------------------------------------------------------------------
// IT-1 — Plain prop pass-through
// ---------------------------------------------------------------------------

describe('IT-1 — plain prop pass-through', () => {
  it('produces the same props when there are no propBindings', () => {
    const root = node('root', 'base.container', { text: 'hello', count: 42 })
    const component = vc('vc-1', [root], 'root')
    const { nodes, rootNodeId } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(rootNodeId).toBe('root')
    expect(nodes['root'].props).toEqual({ text: 'hello', count: 42 })
  })
})

// ---------------------------------------------------------------------------
// IT-2 — Single propBinding with override (param.id key)
// ---------------------------------------------------------------------------

describe('IT-2 — single propBinding with override', () => {
  it('substitutes the bound prop with the override value keyed by paramId', () => {
    const root = node(
      'root',
      'base.text',
      { content: 'default text' },
      { propBindings: { content: { paramId: 'param-1' } } },
    )
    const component = vc('vc-1', [root], 'root', [
      { id: 'param-1', name: 'label', type: 'string', defaultValue: 'default text', required: false },
    ])

    const { nodes } = instantiateVCAtRef(component, { 'param-1': 'overridden text' }, {}, {}, TEST_REF_ID)

    expect(nodes['root'].props.content).toBe('overridden text')
  })
})

// ---------------------------------------------------------------------------
// IT-3 — Single propBinding fallback to param.defaultValue
// ---------------------------------------------------------------------------

describe('IT-3 — propBinding fallback to defaultValue', () => {
  it('uses param.defaultValue when no override is provided for the param', () => {
    const root = node(
      'root',
      'base.text',
      { content: '' },
      { propBindings: { content: { paramId: 'param-1' } } },
    )
    const component = vc('vc-1', [root], 'root', [
      { id: 'param-1', name: 'label', type: 'string', defaultValue: 'fallback value', required: false },
    ])

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['root'].props.content).toBe('fallback value')
  })
})

// ---------------------------------------------------------------------------
// IT-4 — Multiple propBindings on one node
// ---------------------------------------------------------------------------

describe('IT-4 — multiple propBindings on one node', () => {
  it('substitutes all bound props independently', () => {
    const root = node(
      'root',
      'base.button',
      { label: 'click', href: '/' },
      {
        propBindings: {
          label: { paramId: 'p-label' },
          href: { paramId: 'p-href' },
        },
      },
    )
    const component = vc('vc-1', [root], 'root', [
      { id: 'p-label', name: 'buttonLabel', type: 'string', defaultValue: 'default', required: false },
      { id: 'p-href', name: 'buttonHref', type: 'url', defaultValue: '#', required: false },
    ])

    const { nodes } = instantiateVCAtRef(component, { 'p-label': 'Buy Now', 'p-href': '/checkout' }, {}, {}, TEST_REF_ID)

    expect(nodes['root'].props.label).toBe('Buy Now')
    expect(nodes['root'].props.href).toBe('/checkout')
  })
})

// ---------------------------------------------------------------------------
// IT-5 — propBindings on non-root node
// ---------------------------------------------------------------------------

describe('IT-5 — propBindings on non-root (child) node', () => {
  it('applies prop substitution to a deeply nested node', () => {
    const child = node(
      'child-1',
      'base.text',
      { content: '' },
      { propBindings: { content: { paramId: 'p-text' } } },
    )
    const root = node('root', 'base.container', {}, { children: ['child-1'] })
    const component = vc('vc-1', [root, child], 'root', [
      { id: 'p-text', name: 'bodyText', type: 'string', defaultValue: 'default body', required: false },
    ])

    const { nodes } = instantiateVCAtRef(component, { 'p-text': 'injected body' }, {}, {}, TEST_REF_ID)

    expect(nodes['child-1'].props.content).toBe('injected body')
  })
})

// ---------------------------------------------------------------------------
// IT-6 — Slot outlet replaced with slot content nodes
// ---------------------------------------------------------------------------

describe('IT-6 — slot outlet replaced with slot content', () => {
  it('replaces a base.slot-outlet node with slot content nodes', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'body' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const component = vc('vc-1', [root, slotOutlet], 'root')

    const contentNode = node('content-1', 'base.text', { content: 'slot content' })
    const pageNodes = { 'content-1': contentNode }
    const { nodes, rootNodeId } = instantiateVCAtRef(component, {}, { body: ['content-1'] }, pageNodes, TEST_REF_ID)

    expect(rootNodeId).toBe('root')
    // Root's children should now point to the content node, not the slot outlet
    expect(nodes['root'].children).toEqual(['content-1'])
    // Content node should be registered in the flat map
    expect(nodes['content-1']).toBeDefined()
    expect(nodes['content-1'].props.content).toBe('slot content')
    // Slot outlet should NOT be in the flat map (was replaced)
    expect(nodes['slot-outlet']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// IT-7 — Slot outlet kept as placeholder when no content provided
// ---------------------------------------------------------------------------

describe('IT-7 — slot outlet kept as placeholder', () => {
  it('keeps the slot outlet node when no slot content is provided', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'header' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const component = vc('vc-1', [root, slotOutlet], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['slot-outlet']).toBeDefined()
    expect(nodes['slot-outlet'].moduleId).toBe('base.slot-outlet')
    expect(nodes['root'].children).toEqual(['slot-outlet'])
  })
})

// ---------------------------------------------------------------------------
// IT-8 — Slot outlet replaced with param defaultValue content
// ---------------------------------------------------------------------------

describe('IT-8 — slot outlet uses param defaultValue when no instance content', () => {
  it('falls back to a slot param defaultValue if no slotContent is provided', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'footer' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const defaultSlotNode = node('default-footer', 'base.text', { content: 'default footer' })
    const component = vc('vc-1', [root, slotOutlet], 'root', [
      {
        id: 'p-footer',
        name: 'footer',
        type: 'slot',
        defaultValue: [defaultSlotNode],
        required: false,
      },
    ])

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    // Should use the param's defaultValue as slot content
    expect(nodes['default-footer']).toBeDefined()
    expect(nodes['default-footer'].props.content).toBe('default footer')
    expect(nodes['root'].children).toEqual(['default-footer'])
  })
})

// ---------------------------------------------------------------------------
// IT-9 — Empty slot content array falls back to param defaultValue
// ---------------------------------------------------------------------------

describe('IT-9 — empty slot content falls back to param defaultValue', () => {
  it('uses param defaultValue when slotContent array is empty', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'sidebar' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const defaultNode = node('default-sidebar', 'base.text', { content: 'default sidebar' })
    const component = vc('vc-1', [root, slotOutlet], 'root', [
      {
        id: 'p-sidebar',
        name: 'sidebar',
        type: 'slot',
        defaultValue: [defaultNode],
        required: false,
      },
    ])

    // Passing empty array → should fall back to param defaultValue
    const { nodes } = instantiateVCAtRef(component, {}, { sidebar: [] }, {}, TEST_REF_ID)

    expect(nodes['default-sidebar']).toBeDefined()
    expect(nodes['root'].children).toEqual(['default-sidebar'])
  })
})

// ---------------------------------------------------------------------------
// IT-10 — base.visual-component-ref passes through unchanged
// ---------------------------------------------------------------------------

describe('IT-10 — nested base.visual-component-ref passes through', () => {
  it('keeps a nested ref node in the output for VCInlineTree to handle', () => {
    const nestedRef = node('nested-ref', 'base.visual-component-ref', {
      componentId: 'vc-nested',
      propOverrides: {},
      slotContent: {},
    })
    const root = node('root', 'base.container', {}, { children: ['nested-ref'] })
    const component = vc('vc-1', [root, nestedRef], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['nested-ref']).toBeDefined()
    expect(nodes['nested-ref'].moduleId).toBe('base.visual-component-ref')
    expect(nodes['nested-ref'].props.componentId).toBe('vc-nested')
  })
})

// ---------------------------------------------------------------------------
// IT-11 — rootNodeId matches vc.tree.rootNodeId
// ---------------------------------------------------------------------------

describe('IT-11 — rootNodeId matches vc.tree.rootNodeId', () => {
  it('returns the root node ID from the VC definition', () => {
    const root = node('my-root-id', 'base.body')
    const component = vc('vc-1', [root], 'my-root-id')

    const { rootNodeId } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(rootNodeId).toBe('my-root-id')
  })
})

// ---------------------------------------------------------------------------
// IT-12 — All nodes appear in the flat output map
// ---------------------------------------------------------------------------

describe('IT-12 — all nodes appear in the flat output map', () => {
  it('all descendant nodes appear in the flat nodes map', () => {
    const grandchild = node('grandchild', 'base.text', { content: 'deep' })
    const child = node('child', 'base.container', {}, { children: ['grandchild'] })
    const root = node('root', 'base.container', {}, { children: ['child'] })
    const component = vc('vc-1', [root, child, grandchild], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['root']).toBeDefined()
    expect(nodes['child']).toBeDefined()
    expect(nodes['grandchild']).toBeDefined()
    // Verify tree structure is preserved
    expect(nodes['root'].children).toEqual(['child'])
    expect(nodes['child'].children).toEqual(['grandchild'])
  })
})

// ---------------------------------------------------------------------------
// IT-13 — All emitted nodes carry _owningRefId = refId
// ---------------------------------------------------------------------------

describe('IT-13 — all nodes carry _owningRefId annotation', () => {
  it('sets _owningRefId to the provided refId on every node', () => {
    const child = node('child', 'base.text', { content: 'hello' })
    const root = node('root', 'base.container', {}, { children: ['child'] })
    const component = vc('vc-1', [root, child], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, 'my-ref-id')

    expect(nodes['root']._owningRefId).toBe('my-ref-id')
    expect(nodes['child']._owningRefId).toBe('my-ref-id')
  })
})

// ---------------------------------------------------------------------------
// IT-14 — VC body nodes are _fromSlotContent = false
// ---------------------------------------------------------------------------

describe('IT-14 — VC body nodes have _fromSlotContent = false', () => {
  it('marks nodes from the VC body as _fromSlotContent = false', () => {
    const child = node('child', 'base.text', { content: 'body content' })
    const root = node('root', 'base.container', {}, { children: ['child'] })
    const component = vc('vc-1', [root, child], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['root']._fromSlotContent).toBe(false)
    expect(nodes['child']._fromSlotContent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// IT-15 — Slot content nodes are _fromSlotContent = true
// ---------------------------------------------------------------------------

describe('IT-15 — slot content nodes have _fromSlotContent = true', () => {
  it('marks slot content nodes (and their descendants) as _fromSlotContent = true', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'body' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const component = vc('vc-1', [root, slotOutlet], 'root')

    // Slot content nodes come from the page tree (Task 4 Tree Unification).
    // slotInstancesByName maps slotName → direct child IDs of the slot-instance node;
    // pageNodes provides the full subtree for recursive collection.
    const contentChild = node('content-child', 'base.text', { content: 'child content' })
    const contentRoot = node('content-root', 'base.container', {}, { children: ['content-child'] })
    const pageNodes = { 'content-root': contentRoot, 'content-child': contentChild }
    const { nodes } = instantiateVCAtRef(component, {}, { body: ['content-root'] }, pageNodes, TEST_REF_ID)

    expect(nodes['content-root']._fromSlotContent).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// IT-16 — Slot outlet placeholder is _fromSlotContent = false
// ---------------------------------------------------------------------------

describe('IT-16 — slot outlet placeholder has _fromSlotContent = false', () => {
  it('slot outlet kept as placeholder is part of VC body, not slot content', () => {
    const slotOutlet = node('slot-outlet', 'base.slot-outlet', { slotName: 'header' })
    const root = node('root', 'base.container', {}, { children: ['slot-outlet'] })
    const component = vc('vc-1', [root, slotOutlet], 'root')

    const { nodes } = instantiateVCAtRef(component, {}, {}, {}, TEST_REF_ID)

    expect(nodes['slot-outlet']).toBeDefined()
    expect(nodes['slot-outlet']._fromSlotContent).toBe(false)
    expect(nodes['slot-outlet']._owningRefId).toBe(TEST_REF_ID)
  })
})
