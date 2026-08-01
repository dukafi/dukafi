/**
 * Task #436 — Visual Components Data Layer
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * Architecture source: Contribution #619 §2–§6, §9, §10
 *
 * Task #436 implements the first of three VC implementation tasks. It delivers
 * the pure data layer that Tasks #437 (Canvas Integration) and #438 (Publisher
 * Emission) build on:
 *
 *   src/core/visualComponents/types.ts             — VisualComponent, VCParam, PropBinding
 *   src/core/visualComponents/nameValidation.ts    — validateComponentName (5 error codes)
 *   src/core/visualComponents/recursionGuard.ts    — getReferencedComponentIds + wouldCreateCycle
 *   src/core/editor-store/slices/visualComponentsSlice.ts — CRUD slice (mirrors filesSlice)
 *   src/core/page-tree/pageNode.ts (extension)     — PageNode.propBindings optional field
 *   src/core/page-tree/siteDocument.ts (type)      — SiteDocument.visualComponents: VisualComponent[]
 *   src/core/persistence/validate.ts (extension)   — validateSite lenient-per-item VC handling
 *
 * ── Gate groups ──────────────────────────────────────────────────────────────
 *
 * Section 4 — nameValidation: free-form names (NV-1 – NV-9)
 * Section 5 — recursionGuard pure functions (RG-1 – RG-8)
 * Section 6 — visualComponentsSlice CRUD via store (SL-1 – SL-14)
 * Section 7 — validateSite extension (VP-1 – VP-7)
 *
 * Total: ~52 gates (most pre-failing until Task #436 is implemented)
 *
 * Both flags from Test Engineer review #1894 are directly addressed here:
 *  Flag #1: §3 recursion guard is at slice write boundary → RG-4 to RG-8
 *  Flag #2: §6 name validation per error code → NV-1 + NV-6 + NV-9 (only EMPTY + PROJECT_DUPLICATE remain)
 *
 * @see Contribution #619 §2 — data model
 * @see Contribution #619 §3 — recursion guard spec
 * @see Contribution #619 §6 — name validation spec
 * @see Contribution #619 §9 — validateSite extension
 * @see src/core/files/pathValidation.ts — pattern template (isSafePath)
 * @see src/core/editor-store/slices/filesSlice.ts — pattern template (CRUD slice)
 * @see Task #436 — VC Data Layer
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import { validateSite, validateVisualComponents } from '@core/persistence/validate'
import type { SiteDocument } from '@core/page-tree'
import { safeParseValue } from '@core/utils/typeboxHelpers'

// ---------------------------------------------------------------------------
// Lazy-loaded functional modules (fail gracefully if not yet implemented)
// ---------------------------------------------------------------------------

let validateComponentName: (
  name: string,
  existing: Array<{ id: string; name: string }>,
  selfId?: string
) => { ok: true } | { ok: false; error: string; reason: string }

let getReferencedComponentIds: (node: unknown) => Set<string>
let wouldCreateCycle: (
  visualComponents: unknown[],
  hostVcId: string,
  candidateChildVcId: string
) => boolean

try {
   
  const nvMod = require('@core/visualComponents')
  validateComponentName = nvMod.validateComponentName
} catch {
  validateComponentName = undefined as unknown as typeof validateComponentName
}

try {
   
  const rgMod = require('@core/visualComponents')
  getReferencedComponentIds = rgMod.getReferencedComponentIds
  wouldCreateCycle          = rgMod.wouldCreateCycle
} catch {
  getReferencedComponentIds = undefined as unknown as typeof getReferencedComponentIds
  wouldCreateCycle          = undefined as unknown as typeof wouldCreateCycle
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireNV(fn: typeof validateComponentName) {
  if (!fn) {
    throw new Error(
      '[Task #436 not implemented] validateComponentName is not exported from\n' +
      '  src/core/visualComponents/nameValidation.ts\n\n' +
      'Implement the module and export validateComponentName to make this gate green.',
    )
  }
}

function requireRG(fn: unknown) {
  if (!fn) {
    throw new Error(
      '[Task #436 not implemented] recursionGuard function not found in\n' +
      '  src/core/visualComponents/recursionGuard.ts\n\n' +
      'Implement and export getReferencedComponentIds + wouldCreateCycle.',
    )
  }
}

/** Store helpers — mirrors filesDataLayer.test.ts pattern */
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
  })
  return useEditorStore.getState()
}

function setupSite() {
  const s = freshStore()
  s.createSite('VC Test SiteDocument')
  return useEditorStore.getState()
}

function requireSliceAction(actionName: string): void {
  const state = useEditorStore.getState() as Record<string, unknown>
  if (typeof state[actionName] !== 'function') {
    throw new Error(
      `[Task #436 not implemented] useEditorStore.getState().${actionName} is not a function.\n\n` +
      'Add visualComponentsSlice to the store to make this gate green.',
    )
  }
}

/** Minimal base-site fixture for validateSite tests */
function rawSite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'proj-vc',
    name: 'VC SiteDocument',
    createdAt: 1000,
    updatedAt: 2000,
    files: [],
    styleRules: {},
    visualComponents: [],
    breakpoints: [{ id: 'desktop', label: 'Desktop', width: 1440, icon: 'monitor' }],
    settings: {
      colorTokens: {},
      shortcuts: {},
    },
    pages: [
      {
        id: 'page-1',
        title: 'Home',
        slug: 'index',
        rootNodeId: 'root',
        nodes: {
          root: {
            id: 'root',
            moduleId: 'base.body',
            props: {},
            children: [],
            breakpointOverrides: {},
            classIds: [],
          },
        },
      },
    ],
    ...overrides,
  }
}

/** Minimal valid VC shape for validateSite tests — flat tree. */
function rawVC(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vc-card-1',
    name: 'Card',
    tree: {
      rootNodeId: 'vc-root',
      nodes: {
        'vc-root': {
          id: 'vc-root',
          moduleId: 'base.container',
          props: {},
          children: [],
          breakpointOverrides: {},
          classIds: [],
        },
      },
    },
    params: [],
    breakpoints: [],
    classIds: [],
    createdAt: 1000,
    ...overrides,
  }
}

describe('Gate TS-2 — BaseNode.propBindings optional field declared', () => {
  it('BaseNodeSchema declares propBindings as an optional record of paramId references', async () => {
    const { BaseNodeSchema } = await import('@core/page-tree')
    const properties = (BaseNodeSchema as { properties?: Record<string, unknown> }).properties
    expect(properties).toBeDefined()
    expect(properties!['propBindings']).toBeDefined()

    // Optional: parsing without propBindings succeeds and produces undefined
    const probe = safeParseValue(BaseNodeSchema, {
      id: 'n1',
      moduleId: 'm',
      props: {},
      breakpointOverrides: {},
      children: [],
      classIds: [],
    })
    expect(probe.ok).toBe(true)
    if (probe.ok) expect(probe.value.propBindings).toBeUndefined()

    // Accepts a valid propBindings record
    const withBinding = safeParseValue(BaseNodeSchema, {
      id: 'n1',
      moduleId: 'm',
      props: {},
      breakpointOverrides: {},
      children: [],
      classIds: [],
      propBindings: { text: { paramId: 'p1' } },
    })
    expect(withBinding.ok).toBe(true)
    if (withBinding.ok) expect(withBinding.value.propBindings).toEqual({ text: { paramId: 'p1' } })
  })
})

// ============================================================================
// Section 4 — nameValidation: one gate per NameError code
// ============================================================================

describe('Gate NV-1 — EMPTY: empty string rejected', () => {
  it('validateComponentName("", []) returns {ok:false, error:"EMPTY"}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('', [])
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('EMPTY')
  })
})

describe('Gate NV-2 — lowercase-starting names are now allowed (free-form)', () => {
  it('validateComponentName("card", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('card', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-3 — digit-starting names are now allowed (free-form)', () => {
  it('validateComponentName("123Card", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('123Card', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-4 — names containing spaces are now allowed (free-form)', () => {
  it('validateComponentName("Hero Section", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('Hero Section', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-5 — names matching a base module display name are now allowed (free-form)', () => {
  it('validateComponentName("Button", []) returns {ok:true}', () => {
    // Components are stored entities, not generated source files — sharing a
    // name with a base module is harmless.
    requireNV(validateComponentName)
    const result = validateComponentName('Button', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-6 — PROJECT_DUPLICATE: duplicate name in same site rejected', () => {
  it('validateComponentName("Card", [{id:"vc-1", name:"Card"}]) returns {ok:false, error:"PROJECT_DUPLICATE"}', () => {
    requireNV(validateComponentName)
    const existing = [{ id: 'vc-1', name: 'Card' }]
    const result = validateComponentName('Card', existing)
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toBe('PROJECT_DUPLICATE')
  })
})

describe('Gate NV-7 — basic name accepted', () => {
  it('validateComponentName("Card", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('Card', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-8 — multi-word name with spaces accepted', () => {
  it('validateComponentName("My Button", []) returns {ok:true}', () => {
    requireNV(validateComponentName)
    const result = validateComponentName('My Button', [])
    expect(result.ok).toBe(true)
  })
})

describe('Gate NV-9 — selfId skip: renaming to own existing name is allowed', () => {
  it('validateComponentName("Card", [{id:"vc-1", name:"Card"}], "vc-1") returns {ok:true}', () => {
    requireNV(validateComponentName)
    const existing = [{ id: 'vc-1', name: 'Card' }]
    // selfId matches vc-1 — should NOT trigger PROJECT_DUPLICATE
    const result = validateComponentName('Card', existing, 'vc-1')
    expect(result.ok).toBe(true)
  })
})

// ============================================================================
// Section 5 — recursionGuard pure functions
// ============================================================================

describe('Gate RG-1 — getReferencedComponentIds: leaf node returns empty set', () => {
  it('a node with no children and moduleId !== base.visual-component-ref returns empty set', () => {
    requireRG(getReferencedComponentIds)
    const leafNode = {
      id: 'n1',
      moduleId: 'base.text',
      props: { text: 'Hello' },
      children: [],
      breakpointOverrides: {},
    }
    const ids = getReferencedComponentIds(leafNode)
    expect(ids.size).toBe(0)
  })
})

describe('Gate RG-2 — getReferencedComponentIds: direct componentRef found', () => {
  it('a VC whose tree root is a base.visual-component-ref returns its componentId', () => {
    requireRG(getReferencedComponentIds)
    const refNode = {
      id: 'n1',
      moduleId: 'base.visual-component-ref',
      props: { componentId: 'vc-banner-1', propOverrides: {} },
      children: [],
      breakpointOverrides: {},
    }
    // getReferencedComponentIds expects a VC with flat tree.nodes, not a raw node
    const vc = { tree: { nodes: { n1: refNode }, rootNodeId: 'n1' } }
    const ids = getReferencedComponentIds(vc)
    expect(ids.has('vc-banner-1')).toBe(true)
  })
})

describe('Gate RG-3 — getReferencedComponentIds: nested componentRef discovered', () => {
  it('a componentRef nested inside the flat tree is found', () => {
    requireRG(getReferencedComponentIds)
    const containerNode = {
      id: 'container',
      moduleId: 'base.container',
      props: {},
      children: ['ref-child'],
      breakpointOverrides: {},
    }
    const refChild = {
      id: 'ref-child',
      moduleId: 'base.visual-component-ref',
      props: { componentId: 'vc-card-1', propOverrides: {} },
      children: [],
      breakpointOverrides: {},
    }
    // getReferencedComponentIds expects a VC with flat tree.nodes
    const vc = {
      tree: {
        nodes: { container: containerNode, 'ref-child': refChild },
        rootNodeId: 'container',
      },
    }
    const ids = getReferencedComponentIds(vc)
    expect(ids.has('vc-card-1')).toBe(true)
  })
})

function makeSimpleVC(id: string, name: string, extraNodes: Record<string, unknown> = {}) {
  const rootNode = { id: 'root', moduleId: 'base.container', props: {}, children: Object.keys(extraNodes), breakpointOverrides: {} }
  return {
    id,
    name,
    tree: { nodes: { root: rootNode, ...extraNodes }, rootNodeId: 'root' },
    params: [],
    breakpoints: [],
    classIds: [],
    createdAt: 1000,
  }
}

describe('Gate RG-4 — wouldCreateCycle: returns false when no cycle', () => {
  it('adding Banner inside Card (no cross-reference) → no cycle', () => {
    requireRG(wouldCreateCycle)
    const vcs = [
      makeSimpleVC('vc-card', 'Card'),
      makeSimpleVC('vc-banner', 'Banner'),
    ]
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-banner')
    expect(result).toBe(false)
  })
})

describe('Gate RG-5 — wouldCreateCycle: detects self-cycle', () => {
  it('adding Card inside Card → cycle detected', () => {
    requireRG(wouldCreateCycle)
    const vcs = [makeSimpleVC('vc-card', 'Card')]
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-card')
    expect(result).toBe(true)
  })
})

describe('Gate RG-6 — wouldCreateCycle: detects 2-step cycle', () => {
  it('A contains B; trying to add A inside B → cycle detected', () => {
    requireRG(wouldCreateCycle)
    // Banner's flat tree already contains a visualComponentRef to Card
    const vcBanner = {
      id: 'vc-banner',
      name: 'Banner',
      tree: {
        rootNodeId: 'banner-root',
        nodes: {
          'banner-root': {
            id: 'banner-root',
            moduleId: 'base.container',
            props: {},
            children: ['card-ref'],
            breakpointOverrides: {},
          },
          'card-ref': {
            id: 'card-ref',
            moduleId: 'base.visual-component-ref',
            props: { componentId: 'vc-card', propOverrides: {} },
            children: [],
            breakpointOverrides: {},
          },
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 1000,
    }
    const vcs = [
      makeSimpleVC('vc-card', 'Card'),
      vcBanner,
    ]
    // Card tries to embed Banner — Banner already contains Card → cycle
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-banner')
    expect(result).toBe(true)
  })
})

describe('Gate RG-7 — wouldCreateCycle: detects 3-step cycle', () => {
  it('A→B→C; trying to add A inside C → cycle detected', () => {
    requireRG(wouldCreateCycle)
    // C contains B, B contains A. Trying to add A inside C would create A→B→C→A
    const vcC = {
      id: 'vc-c',
      name: 'Gamma',
      tree: {
        rootNodeId: 'c-root',
        nodes: {
          'c-root': { id: 'c-root', moduleId: 'base.container', props: {}, children: ['b-ref'], breakpointOverrides: {} },
          'b-ref': { id: 'b-ref', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-b', propOverrides: {} }, children: [], breakpointOverrides: {} },
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 1000,
    }
    const vcB = {
      id: 'vc-b',
      name: 'Beta',
      tree: {
        rootNodeId: 'b-root',
        nodes: {
          'b-root': { id: 'b-root', moduleId: 'base.container', props: {}, children: ['a-ref'], breakpointOverrides: {} },
          'a-ref': { id: 'a-ref', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-a', propOverrides: {} }, children: [], breakpointOverrides: {} },
        },
      },
      params: [],
      breakpoints: [],
      classIds: [],
      createdAt: 1000,
    }
    const vcs = [
      makeSimpleVC('vc-a', 'Alpha'),
      vcB,
      vcC,
    ]
    // vc-c tries to embed vc-a; vc-c already reaches vc-a via vc-b → cycle
    const result = wouldCreateCycle(vcs, 'vc-c', 'vc-a')
    expect(result).toBe(true)
  })
})

describe('Gate RG-8 — wouldCreateCycle: handles unknown candidate id gracefully', () => {
  it('candidate vc not in the array → returns false (no crash)', () => {
    requireRG(wouldCreateCycle)
    const vcs = [makeSimpleVC('vc-card', 'Card')]
    // candidate doesn't exist — should not throw, just return false
    expect(() => wouldCreateCycle(vcs, 'vc-card', 'vc-nonexistent')).not.toThrow()
    const result = wouldCreateCycle(vcs, 'vc-card', 'vc-nonexistent')
    expect(result).toBe(false)
  })
})

// ============================================================================
// Section 6 — visualComponentsSlice CRUD (via useEditorStore)
// ============================================================================

describe('Gate SL-1 — createVisualComponent: adds vc to site.visualComponents', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent adds a VC and returns its id', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    const site = useEditorStore.getState().site!
    const vcs = (site as unknown as { visualComponents: Array<{ id: string }> }).visualComponents
    expect(vcs).toBeDefined()
    expect(vcs.some((vc) => vc.id === id)).toBe(true)
  })
})


describe('Gate SL-3 — createVisualComponent: throws on EMPTY name', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent("") throws VisualComponentNameError', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    expect(() => (s.createVisualComponent as (name: string) => string)('')).toThrow()
  })
})

describe('Gate SL-4 — createVisualComponent: free-form names accepted (no PascalCase requirement)', () => {
  beforeEach(() => { setupSite() })

  it('createVisualComponent("my header section") does NOT throw', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    expect(() => (s.createVisualComponent as (name: string) => string)('my header section')).not.toThrow()
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ name: string }> }).visualComponents
    expect(vcs.some((vc) => vc.name === 'my header section')).toBe(true)
  })
})

describe('Gate SL-5 — createVisualComponent: throws on PROJECT_DUPLICATE name', () => {
  beforeEach(() => { setupSite() })

  it('creating two VCs with the same name throws on the second', () => {
    requireSliceAction('createVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    ;(s.createVisualComponent as (name: string) => string)('Card')
    expect(() => (useEditorStore.getState() as Record<string, unknown>).createVisualComponent as (name: string) => string).not.toThrow()
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).createVisualComponent as (name: string) => string)('Card')
    ).toThrow()
  })
})

describe('Gate SL-6 — renameVisualComponent: updates name', () => {
  beforeEach(() => { setupSite() })

  it('renaming "Card" to "HeroCard" updates name', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    ;(useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void
    ;((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'HeroCard')
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; name: string }> }).visualComponents
    const vc = vcs.find((v) => v.id === id)!
    expect(vc.name).toBe('HeroCard')
  })
})

describe('Gate SL-7 — renameVisualComponent: throws on invalid new name', () => {
  beforeEach(() => { setupSite() })

  it('renaming a VC to an empty name throws', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, '   ')
    ).toThrow()
  })

  it('renaming a VC to a name already used by another VC throws', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    ;(s.createVisualComponent as (name: string) => string)('Card')
    const id = (useEditorStore.getState() as { createVisualComponent: (name: string) => string }).createVisualComponent('Other')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'Card')
    ).toThrow()
  })
})

describe('Gate SL-8 — renameVisualComponent: renaming to same name is no-op (selfId check)', () => {
  beforeEach(() => { setupSite() })

  it('renaming "Card" to "Card" does not throw (selfId skip in name validation)', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('renameVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).renameVisualComponent as (id: string, name: string) => void)(id, 'Card')
    ).not.toThrow()
  })
})

describe('Gate SL-9 — deleteVisualComponent: removes vc by id', () => {
  beforeEach(() => { setupSite() })

  it('deleteVisualComponent removes the vc from site.visualComponents', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('deleteVisualComponent')
    const s = useEditorStore.getState() as Record<string, unknown>
    const id = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).deleteVisualComponent as (id: string) => void)(id)
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string }> }).visualComponents ?? []
    expect(vcs.some((vc) => vc.id === id)).toBe(false)
  })
})

describe('Gate SL-10 — deleteVisualComponent: no-op for unknown id', () => {
  beforeEach(() => { setupSite() })

  it('deleteVisualComponent("nonexistent") does not throw', () => {
    requireSliceAction('deleteVisualComponent')
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).deleteVisualComponent as (id: string) => void)('nonexistent')
    ).not.toThrow()
  })
})

describe('Gate SL-11 — addParam: appends a VCParam to vc.params', () => {
  beforeEach(() => { setupSite() })

  it('addParam adds a param with a stable id to the VC', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addParam')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).addParam as (vcId: string, name: string, type: string) => void)(vcId, 'title', 'string')
    const vcs = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; params: Array<{ name: string; id: string }> }> }).visualComponents
    const vc = vcs.find((v) => v.id === vcId)!
    expect(vc.params).toHaveLength(1)
    expect(vc.params[0].name).toBe('title')
    // Stable id must be present — survives renames
    expect(typeof vc.params[0].id).toBe('string')
    expect(vc.params[0].id.length).toBeGreaterThan(0)
  })
})

describe('Gate SL-12 — removeParamWithCleanup: removes a VCParam by id and cleans up bindings', () => {
  beforeEach(() => { setupSite() })

  it('removeParamWithCleanup removes the param from vc.params', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addParam')
    requireSliceAction('removeParamWithCleanup')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    ;((useEditorStore.getState() as Record<string, unknown>).addParam as (vcId: string, name: string, type: string) => void)(vcId, 'title', 'string')
    const paramId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; params: Array<{ id: string }> }> }).visualComponents.find((v) => v.id === vcId)!.params[0].id

    // Set a propBinding on the VC root node to verify cleanup
    type FlatVC = { id: string; tree: { rootNodeId: string; nodes: Record<string, { propBindings?: Record<string, { paramId: string }> }> }; params: Array<{ id: string }> }
    const vc = (useEditorStore.getState().site as unknown as { visualComponents: FlatVC[] }).visualComponents.find((v) => v.id === vcId)!
    // Set activeDocument so setNodePropBinding targets the VC tree
    useEditorStore.setState({ activeDocument: { kind: 'visualComponent', vcId } } as Parameters<typeof useEditorStore.setState>[0])
    ;((useEditorStore.getState() as Record<string, unknown>).setNodePropBinding as (nodeId: string, propKey: string, paramId: string) => void)(vc.tree.rootNodeId, 'text', paramId)

    // Verify binding is set
    const vcBefore = (useEditorStore.getState().site as unknown as { visualComponents: FlatVC[] }).visualComponents.find((v) => v.id === vcId)!
    expect(vcBefore.tree.nodes[vcBefore.tree.rootNodeId]?.propBindings?.text?.paramId).toBe(paramId)

    // Call removeParamWithCleanup
    ;((useEditorStore.getState() as Record<string, unknown>).removeParamWithCleanup as (vcId: string, paramId: string) => void)(vcId, paramId)

    const vcAfter = (useEditorStore.getState().site as unknown as { visualComponents: FlatVC[] }).visualComponents.find((v) => v.id === vcId)!
    // Param removed
    expect(vcAfter.params).toHaveLength(0)
    // Binding cleaned up
    expect(vcAfter.tree.nodes[vcAfter.tree.rootNodeId]?.propBindings?.text).toBeUndefined()
  })
})

describe('Gate SL-13 — addNodeToVc: cycle guard fires at slice write boundary', () => {
  beforeEach(() => { setupSite() })

  it('adding a componentRef that creates a self-cycle throws at the slice boundary', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addNodeToVc')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    const selfRefNode = {
      id: 'self-ref',
      moduleId: 'base.visual-component-ref',
      props: { componentId: vcId, propOverrides: {} },
      children: [],
      breakpointOverrides: {},
    }
    // The vc's root node id — get from flat tree
    const vcRootNodeId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; tree: { rootNodeId: string } }> }).visualComponents.find((v) => v.id === vcId)!.tree.rootNodeId
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).addNodeToVc as (vcId: string, parentNodeId: string, newNode: unknown) => void)(vcId, vcRootNodeId, selfRefNode)
    ).toThrow()
  })
})

describe('Gate SL-14 — addNodeToVc: succeeds when no cycle', () => {
  beforeEach(() => { setupSite() })

  it('adding a regular (non-ref) node to a VC succeeds', () => {
    requireSliceAction('createVisualComponent')
    requireSliceAction('addNodeToVc')
    const s = useEditorStore.getState() as Record<string, unknown>
    const vcId = (s.createVisualComponent as (name: string) => string)('Card')
    const headingNode = {
      id: 'heading-1',
      moduleId: 'base.text',
      props: { text: 'Card Title' },
      children: [],
      breakpointOverrides: {},
    }
    const vcRootNodeId = (useEditorStore.getState().site as unknown as { visualComponents: Array<{ id: string; tree: { rootNodeId: string } }> }).visualComponents.find((v) => v.id === vcId)!.tree.rootNodeId
    expect(() =>
      ((useEditorStore.getState() as Record<string, unknown>).addNodeToVc as (vcId: string, parentNodeId: string, newNode: unknown) => void)(vcId, vcRootNodeId, headingNode)
    ).not.toThrow()
  })
})

// ============================================================================
// Section 7 — validateSite extension
// ============================================================================

describe('Gate VP-2 — valid VC passes through validateVisualComponents cleanly', () => {
  it('a properly-shaped VC is preserved in the output', () => {
    const vcs = validateVisualComponents([rawVC()])
    expect(vcs).toHaveLength(1)
    expect(vcs[0].name).toBe('Card')
  })
})

describe('Gate VP-3 — lenient: VC with invalid (empty) name is dropped', () => {
  it('a VC with a whitespace-only name is silently dropped (lenient per-item)', () => {
    const vcs = validateVisualComponents([rawVC({ name: '   ' })])
    // Either an empty array or the bad entry is dropped — either way, no whitespace vc
    const hasInvalid = vcs.some((vc) => vc.name.trim().length === 0)
    expect(hasInvalid).toBe(false)
  })
})

describe('Gate VP-4 — lenient: VC with no name is dropped', () => {
  it('a VC with missing name field is silently dropped', () => {
    const badVC = rawVC()
    delete (badVC as Record<string, unknown>).name
    const vcs = validateVisualComponents([badVC])
    // Invalid entry must not survive
    expect(vcs.some((vc) => !vc.name)).toBe(false)
  })
})

describe('Gate VP-5 — lenient: duplicate VC names are deduplicated (first-wins)', () => {
  it('two VCs with the same name keep only the first one', () => {
    const vc1 = rawVC({ id: 'vc-card-1', name: 'Card' })
    const vc2 = rawVC({ id: 'vc-card-2', name: 'Card' })
    const vcs = validateVisualComponents([vc1, vc2])
    const cardVCs = vcs.filter((v) => v.name === 'Card')
    expect(cardVCs).toHaveLength(1)
    // First-wins — vc-card-1 should survive
    expect(cardVCs[0].id).toBe('vc-card-1')
  })
})


describe('Gate VP-7 — site shell validates independently of VCs', () => {
  it('validateSite does not throw (VCs are stored separately and ignored by the shell parser)', () => {
    // The raw data may carry a visualComponents field from an older stored document —
    // parseSiteDocument ignores it. validateSite must not throw.
    const raw = rawSite({ visualComponents: [rawVC()] })
    expect(() => validateSite(raw)).not.toThrow()
  })

  it('validateVisualComponents processes VCs correctly for a well-formed VC', () => {
    const vcs = validateVisualComponents([rawVC()])
    expect(vcs).toHaveLength(1)
    expect(vcs[0].name).toBe('Card')
  })
})

// ── Round-trip gates (added post-#635 hot-fix — Coverage gaps surfaced by CR msg #1948) ──

describe('Gate VP-8 — validateVisualComponents round-trips flat VC tree', () => {
  /**
   * VC tree shape: `vc.tree = { nodes: Record<string, VCNode>, rootNodeId }`.
   * The legacy `rootNode + childNodes` nested shape was a pre-release-only
   * shape; the migration shim that handled it has been deleted (no users,
   * no installed base, no need for backward compatibility).
   */
  it('a VC with flat tree.nodes survives validateVisualComponents() with the full nodes map intact', () => {
    const childNode = {
      id: 'child-heading',
      moduleId: 'base.text',
      props: { text: 'Card Title' },
      children: [],
      breakpointOverrides: {},
      classIds: [],
    }
    const flatVC = rawVC({
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': {
            id: 'vc-root',
            moduleId: 'base.container',
            props: {},
            children: ['child-heading'],
            breakpointOverrides: {},
            classIds: [],
          },
          'child-heading': childNode,
        },
      },
    })

    const vcs = validateVisualComponents([flatVC])

    const vcResult = vcs[0]
    expect(vcResult).toBeDefined()
    expect(vcResult.tree.rootNodeId).toBe('vc-root')
    // Both nodes must be present in the flat map
    expect(vcResult.tree.nodes['vc-root']).toBeDefined()
    expect(vcResult.tree.nodes['child-heading']).toBeDefined()
    expect(vcResult.tree.nodes['child-heading'].id).toBe('child-heading')
  })

})

describe('Gate VP-9 — validateVisualComponents preserves propBindings on VC nodes in flat tree', () => {
  /**
   * propBindings on any node in the VC flat tree must survive validateVisualComponents().
   * The VC tree is stored as tree.nodes (flat map), and parseVCNode() must preserve
   * propBindings on each node.
   */
  it('propBindings on the root node survive the round-trip', () => {
    const flatVC = rawVC({
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': {
            id: 'vc-root',
            moduleId: 'base.text',
            props: { text: 'Default Title' },
            children: [],
            breakpointOverrides: {},
            classIds: [],
            propBindings: {
              text: { paramId: 'param-title-1' },
            },
          },
        },
      },
    })

    const vcs = validateVisualComponents([flatVC])

    const vcResult = vcs[0]
    expect(vcResult).toBeDefined()
    const rootNode = vcResult.tree.nodes[vcResult.tree.rootNodeId]
    expect((rootNode as { propBindings?: Record<string, { paramId: string }> })?.propBindings?.text?.paramId).toBe('param-title-1')
  })

  it('multiple propBindings on root node all survive the round-trip', () => {
    const flatVC = rawVC({
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': {
            id: 'vc-root',
            moduleId: 'base.container',
            props: {},
            children: [],
            breakpointOverrides: {},
            classIds: [],
            propBindings: {
              title: { paramId: 'param-title-1' },
              subtitle: { paramId: 'param-subtitle-2' },
              backgroundColor: { paramId: 'param-bg-3' },
            },
          },
        },
      },
    })

    const vcs = validateVisualComponents([flatVC])

    const vcResult = vcs[0]
    const rootNode = vcResult?.tree.nodes[vcResult.tree.rootNodeId] as
      | { propBindings?: Record<string, { paramId: string }> }
      | undefined
    expect(rootNode?.propBindings?.title?.paramId).toBe('param-title-1')
    expect(rootNode?.propBindings?.subtitle?.paramId).toBe('param-subtitle-2')
    expect(rootNode?.propBindings?.backgroundColor?.paramId).toBe('param-bg-3')
  })

  it('propBindings on child nodes in the flat map also survive the round-trip', () => {
    const flatVC = rawVC({
      tree: {
        rootNodeId: 'vc-root',
        nodes: {
          'vc-root': {
            id: 'vc-root',
            moduleId: 'base.container',
            props: {},
            children: ['heading-child'],
            breakpointOverrides: {},
            classIds: [],
          },
          'heading-child': {
            id: 'heading-child',
            moduleId: 'base.text',
            props: { text: 'Default' },
            children: [],
            breakpointOverrides: {},
            classIds: [],
            propBindings: {
              text: { paramId: 'param-label-5' },
            },
          },
        },
      },
    })

    const vcs = validateVisualComponents([flatVC])

    const childNode = vcs[0]?.tree.nodes['heading-child'] as
      | { id: string; propBindings?: Record<string, { paramId: string }> }
      | undefined
    expect(childNode?.id).toBe('heading-child')
    expect(childNode?.propBindings?.text?.paramId).toBe('param-label-5')
  })
})

// ============================================================================
// Section 8 — New VCParam types + description field (Phase 1 gate)
// ============================================================================

describe("Gate PT-1 — 'slot' param type round-trips through validateVisualComponents", () => {
  it("a VC with a slot param survives validateVisualComponents with type preserved", () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-slot-1',
          name: 'children',
          type: 'slot',
          defaultValue: [],
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-slot-1')
    expect(param?.type).toBe('slot')
  })
})

describe("Gate PT-2 — 'image' param type round-trips through validateVisualComponents", () => {
  it("a VC with an image param and null defaultValue survives validateVisualComponents", () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-img-1',
          name: 'thumbnail',
          type: 'image',
          defaultValue: null,
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-img-1')
    expect(param?.type).toBe('image')
  })

  it("a VC with an image param and URL defaultValue survives validateVisualComponents", () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-img-2',
          name: 'thumbnail',
          type: 'image',
          defaultValue: 'https://example.com/x.png',
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-img-2')
    expect(param?.type).toBe('image')
    expect(param?.defaultValue).toBe('https://example.com/x.png')
  })
})

describe("Gate PT-3 — 'richText' param type round-trips through validateVisualComponents", () => {
  it("a VC with a richText param and HTML defaultValue survives validateVisualComponents", () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-rt-1',
          name: 'body',
          type: 'richText',
          defaultValue: '<p>hello</p>',
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-rt-1')
    expect(param?.type).toBe('richText')
    expect(param?.defaultValue).toBe('<p>hello</p>')
  })
})

describe('Gate PT-4 — description field on VCParam survives validateVisualComponents round-trip', () => {
  it('a VCParam with description is preserved after validateVisualComponents', () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-desc-1',
          name: 'title',
          type: 'string',
          description: 'Card heading text',
          defaultValue: '',
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-desc-1')
    expect(param?.description).toBe('Card heading text')
  })

  it('a VCParam without description is preserved without injecting undefined', () => {
    const vc = rawVC({
      params: [
        {
          id: 'p-nodesc-1',
          name: 'label',
          type: 'string',
          defaultValue: '',
          required: false,
        },
      ],
    })
    const vcs = validateVisualComponents([vc])
    const param = vcs[0]?.params[0]
    expect(param?.id).toBe('p-nodesc-1')
    expect(param?.description).toBeUndefined()
  })
})

describe('Gate RG-9 — getReferencedComponentIds finds all vcRefs in flat tree regardless of nesting', () => {
  it('finds vcRefs at multiple depths in the flat tree.nodes map', () => {
    requireRG(getReferencedComponentIds)

    // VC with two vcRef nodes: one direct child of root, one grandchild via container
    const vc = {
      tree: {
        rootNodeId: 'root',
        nodes: {
          root: {
            id: 'root',
            moduleId: 'base.container',
            props: {},
            children: ['direct-ref', 'mid-container'],
            breakpointOverrides: {},
          },
          'direct-ref': {
            id: 'direct-ref',
            moduleId: 'base.visual-component-ref',
            props: { componentId: 'vc-outer', propOverrides: {} },
            children: [],
            breakpointOverrides: {},
          },
          'mid-container': {
            id: 'mid-container',
            moduleId: 'base.container',
            props: {},
            children: ['nested-ref'],
            breakpointOverrides: {},
          },
          'nested-ref': {
            id: 'nested-ref',
            moduleId: 'base.visual-component-ref',
            props: { componentId: 'vc-inner', propOverrides: {} },
            children: [],
            breakpointOverrides: {},
          },
        },
      },
    }

    const ids = getReferencedComponentIds(vc)
    expect(ids.has('vc-outer')).toBe(true)
    expect(ids.has('vc-inner')).toBe(true)
  })

  it('all vcRefs in a flat tree with many sibling nodes are collected', () => {
    requireRG(getReferencedComponentIds)

    const vc = {
      tree: {
        rootNodeId: 'root',
        nodes: {
          root: { id: 'root', moduleId: 'base.container', props: {}, children: ['ref-a', 'ref-b', 'ref-c'], breakpointOverrides: {} },
          'ref-a': { id: 'ref-a', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-alpha', propOverrides: {} }, children: [], breakpointOverrides: {} },
          'ref-b': { id: 'ref-b', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-beta', propOverrides: {} }, children: [], breakpointOverrides: {} },
          'ref-c': { id: 'ref-c', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-gamma', propOverrides: {} }, children: [], breakpointOverrides: {} },
        },
      },
    }

    const ids = getReferencedComponentIds(vc)
    expect(ids.has('vc-alpha')).toBe(true)
    expect(ids.has('vc-beta')).toBe(true)
    expect(ids.has('vc-gamma')).toBe(true)
    expect(ids.size).toBe(3)
  })
})

describe('Gate RG-10 — wouldCreateCycle detects cycle via flat tree vcRef', () => {
  it('a vcRef in the flat tree that would create a cycle is detected', () => {
    requireRG(wouldCreateCycle)
    requireRG(getReferencedComponentIds)

    // vc-a's flat tree root node is a vcRef to vc-b
    const vcA = {
      id: 'vc-a',
      name: 'ComponentA',
      tree: {
        rootNodeId: 'root-a',
        nodes: {
          'root-a': {
            id: 'root-a',
            moduleId: 'base.visual-component-ref',
            props: {
              componentId: 'vc-b',
              propOverrides: {},
            },
            children: [],
            breakpointOverrides: {},
          },
        },
      },
    }

    // Adding vc-a inside vc-b would form a cycle (vc-b → vc-a → vc-b)
    const visualComponents = [vcA]
    expect(wouldCreateCycle(visualComponents, 'vc-b', 'vc-a')).toBe(true)
  })
})
