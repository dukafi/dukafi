/**
 * Publisher integration tests — Phase 5 slice 3
 *
 * End-to-end integration of the VC publish pipeline:
 *   - VC inline rendering via publishPage
 *   - Class CSS from VC nodes in the published <style> block
 *   - richText XSS — <script> stripped at the publisher boundary
 *   - Slot content override vs. param defaultValue fallback
 *   - Unknown componentId → HTML comment
 */

import { describe, it, expect } from 'bun:test'

// Populate module registry (side-effect: registers all base modules)
import '@modules/base'

import { publishPage } from '@core/publisher'
import type { VisualComponent, VCNode, VCParam } from '@core/visualComponents'
import type { SiteDocument, Page, PageNode } from '@core/page-tree'
import { registry } from '@core/module-engine'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeVCNode(overrides: Partial<VCNode> & { id: string; moduleId: string }): VCNode {
  return {
    props: {},
    breakpointOverrides: {},
    children: [],
    classIds: [],
    ...overrides,
  }
}

function makeParam(
  overrides: Partial<VCParam> & { id: string; name: string; type: VCParam['type'] },
): VCParam {
  return {
    defaultValue: '',
    required: false,
    ...overrides,
  }
}

function makeVC(overrides: {
  id: string
  name: string
  nodes: VCNode[]
  rootId: string
  params?: VCParam[]
  classIds?: string[]
}): VisualComponent {
  const nodesMap: Record<string, VCNode> = {}
  for (const n of overrides.nodes) nodesMap[n.id] = n
  return {
    params: overrides.params ?? [],
    breakpoints: [],
    classIds: overrides.classIds ?? [],
    createdAt: 0,
    id: overrides.id,
    name: overrides.name,
    tree: { nodes: nodesMap, rootNodeId: overrides.rootId },
  }
}

function makePageNode(
  id: string,
  moduleId: string,
  overrides: Partial<Omit<PageNode, 'id' | 'moduleId'>> = {},
): PageNode {
  return {
    id,
    moduleId,
    props: {},
    breakpointOverrides: {},
    children: [],
    classIds: [],
    ...overrides,
  }
}

function makePage(nodes: Record<string, PageNode>, rootNodeId = 'root'): Page {
  return {
    id: 'page-1',
    slug: 'index',
    title: 'Test Page',
    nodes,
    rootNodeId,
  }
}

function makeSite(overrides: Partial<SiteDocument> = {}): SiteDocument {
  return {
    id: 'site-1',
    name: 'Test Site',
    pages: [],
    files: [],
    visualComponents: [],
    packageJson: { dependencies: {}, devDependencies: {} },
    runtime: { dependencyLock: { version: 1, packages: {}, updatedAt: 0 }, scripts: {} },
    breakpoints: [],
    settings: { colorTokens: {}, shortcuts: {} },
    styleRules: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. VC inline rendering — prop override substitution
// ---------------------------------------------------------------------------

describe('VC inline — prop override substitution', () => {
  const textNode = makeVCNode({
    id: 'vc-text',
    moduleId: 'base.text',
    props: { text: 'Default', tag: 'h1' },
    propBindings: { text: { paramId: 'param-title' } },
  })
  const rootNode = makeVCNode({
    id: 'vc-root',
    moduleId: 'base.container',
    children: ['vc-text'],
  })
  const vc = makeVC({
    id: 'vc-card',
    name: 'Card',
    nodes: [rootNode, textNode],
    rootId: 'vc-root',
    params: [makeParam({ id: 'param-title', name: 'title', type: 'string', defaultValue: 'Default' })],
  })

  it('inlines the VC and substitutes prop override', () => {
    const page = makePage({
      root: makePageNode('root', 'base.visual-component-ref', {
        props: {
          componentId: 'vc-card',
          propOverrides: { 'param-title': 'Override' },
        },
      }),
    })
    const site = makeSite({ visualComponents: [vc], pages: [page] })
    const { html } = publishPage(page, site, registry)
    expect(html).toContain('Override')
    expect(html).not.toContain('Default')
  })
})

// ---------------------------------------------------------------------------
// 2. Class CSS appears in the published <style> block
// ---------------------------------------------------------------------------

describe('VC inline — class CSS in published output', () => {
  it('publishes CSS rule for a VC node classId', () => {
    const textNode = makeVCNode({
      id: 'vc-cls-text',
      moduleId: 'base.text',
      props: { text: 'Styled', tag: 'p' },
      classIds: ['cls-1'],
    })
    const rootNode = makeVCNode({
      id: 'vc-cls-root',
      moduleId: 'base.container',
      children: ['vc-cls-text'],
    })
    const vc = makeVC({ id: 'vc-cls', name: 'Cls', nodes: [rootNode, textNode], rootId: 'vc-cls-root' })

    const page = makePage({
      root: makePageNode('root', 'base.visual-component-ref', {
        props: { componentId: 'vc-cls', propOverrides: {} },
      }),
    })
    const site = makeSite({
      visualComponents: [vc],
      pages: [page],
      styleRules: {
        'cls-1': {
          id: 'cls-1',
          name: 'big-title',
          kind: 'class',
          selector: '.big-title',
          order: 0,
          styles: { fontSize: '3rem' },
          contextStyles: {},
          createdAt: 0,
          updatedAt: 0,
        },
      },
    })
    const { html } = publishPage(page, site, registry)
    expect(html).toContain('big-title')
    expect(html).toContain('font-size')
    expect(html).toContain('3rem')
  })
})

// ---------------------------------------------------------------------------
// 3. richText XSS — <script> stripped end-to-end
// ---------------------------------------------------------------------------

describe('VC inline — richText XSS sanitization', () => {
  it('strips <script> from a richText prop override in published HTML', () => {
    const contentNode = makeVCNode({
      id: 'vc-xss-content',
      moduleId: 'base.outlet',
      props: { html: '' },
      propBindings: { html: { paramId: 'param-body' } },
    })
    const rootNode = makeVCNode({
      id: 'vc-xss-root',
      moduleId: 'base.container',
      children: ['vc-xss-content'],
    })
    const vc = makeVC({
      id: 'vc-xss',
      name: 'XssTest',
      nodes: [rootNode, contentNode],
      rootId: 'vc-xss-root',
      params: [makeParam({ id: 'param-body', name: 'html', type: 'richText', defaultValue: '' })],
    })

    const page = makePage({
      root: makePageNode('root', 'base.visual-component-ref', {
        props: {
          componentId: 'vc-xss',
          propOverrides: { 'param-body': '<p>ok</p><script>bad()</script>' },
        },
      }),
    })
    const site = makeSite({ visualComponents: [vc], pages: [page] })
    const { html } = publishPage(page, site, registry)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('bad()')
    expect(html).toContain('ok')
  })
})

// ---------------------------------------------------------------------------
// 4. Slot override — provided slot content wins over defaultValue
// ---------------------------------------------------------------------------

describe('VC inline — slot content override', () => {
  const slotOutletNode = makeVCNode({
    id: 'vc-slot-outlet',
    moduleId: 'base.slot-outlet',
    props: { slotName: 'body' },
  })
  const slotRootNode = makeVCNode({
    id: 'vc-slot-root',
    moduleId: 'base.container',
    children: ['vc-slot-outlet'],
  })
  const defaultSlotText = makeVCNode({
    id: 'default-slot',
    moduleId: 'base.text',
    props: { text: 'Default slot text', tag: 'p' },
  })
  const vcWithSlot = makeVC({
    id: 'vc-slot',
    name: 'SlotComp',
    nodes: [slotRootNode, slotOutletNode],
    rootId: 'vc-slot-root',
    params: [
      makeParam({
        id: 'param-body',
        name: 'body',
        type: 'slot',
        defaultValue: [defaultSlotText] as unknown,
      }),
    ],
  })

  it('renders provided slot-instance content over defaultValue (Task 4 Tree Unification)', () => {
    // Slot content is now a base.slot-instance child of the VC ref in the page tree.
    // The slot-instance node's children are the user-authored content nodes.
    const page = makePage(
      {
        root: makePageNode('root', 'base.visual-component-ref', {
          props: { componentId: 'vc-slot', propOverrides: {} },
          children: ['slot-inst-body'],
        }),
        'slot-inst-body': makePageNode('slot-inst-body', 'base.slot-instance', {
          props: { slotName: 'body' },
          children: ['override-text'],
          locked: true,
        }),
        'override-text': makePageNode('override-text', 'base.text', {
          props: { text: 'Override slot text', tag: 'p' },
        }),
      },
    )
    const site = makeSite({ visualComponents: [vcWithSlot], pages: [page] })
    const { html } = publishPage(page, site, registry)
    expect(html).toContain('Override slot text')
    expect(html).not.toContain('Default slot text')
  })
})

// ---------------------------------------------------------------------------
// 5. Slot fallback — defaultValue rendered when no slot content provided
// ---------------------------------------------------------------------------

describe('VC inline — slot defaultValue fallback', () => {
  it('renders the slot param defaultValue when no slotContent is provided', () => {
    const slotOutletNode = makeVCNode({
      id: 'vc-fb-outlet',
      moduleId: 'base.slot-outlet',
      props: { slotName: 'main' },
    })
    const slotRootNode = makeVCNode({
      id: 'vc-fb-root',
      moduleId: 'base.container',
      children: ['vc-fb-outlet'],
    })
    const defaultText = makeVCNode({
      id: 'fb-default',
      moduleId: 'base.text',
      props: { text: 'Fallback text', tag: 'p' },
    })
    const vc = makeVC({
      id: 'vc-fb',
      name: 'FallbackComp',
      nodes: [slotRootNode, slotOutletNode],
      rootId: 'vc-fb-root',
      params: [
        makeParam({
          id: 'param-main',
          name: 'main',
          type: 'slot',
          defaultValue: [defaultText] as unknown,
        }),
      ],
    })
    const page = makePage({
      root: makePageNode('root', 'base.visual-component-ref', {
        props: { componentId: 'vc-fb', propOverrides: {} },
      }),
    })
    const site = makeSite({ visualComponents: [vc], pages: [page] })
    const { html } = publishPage(page, site, registry)
    expect(html).toContain('Fallback text')
  })
})

// ---------------------------------------------------------------------------
// 6. Unknown componentId → HTML comment
// ---------------------------------------------------------------------------

describe('VC inline — unknown componentId', () => {
  it('emits an HTML comment for a non-existent componentId', () => {
    const page = makePage({
      root: makePageNode('root', 'base.visual-component-ref', {
        props: {
          componentId: 'nonexistent-vc-xyz',
          propOverrides: {},
        },
      }),
    })
    const site = makeSite({ visualComponents: [], pages: [page] })
    const { html } = publishPage(page, site, registry)
    expect(html).toContain('<!-- instatic: unknown component')
    expect(html).toContain('nonexistent-vc-xyz')
    expect(html).not.toContain('<div>')
  })
})
