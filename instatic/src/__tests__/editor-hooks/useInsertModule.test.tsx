import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useEditorStore } from '@site/store/store'
import { registry } from '@core/module-engine'
import { useInsertModule } from '@site/hooks/useInsertModule'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

beforeEach(() => {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
    packageJson: {},
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  })
})

afterEach(() => {
  cleanup()
})

describe('useInsertModule', () => {
  it('selects the inserted module and opens Properties', () => {
    useEditorStore.getState().createSite('Test SiteDocument')
    const mod = registry.get('base.text')
    expect(mod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedNodeId: string | null = null

    act(() => {
      insertedNodeId = result.current(mod!)
    })

    const state = useEditorStore.getState()
    expect(insertedNodeId).toBeTruthy()
    expect(state.selectedNodeId).toBe(insertedNodeId)
    expect(state.propertiesPanel.collapsed).toBe(false)
  })

  it('inserts into the active VC tree (not the page tree) when in VC edit mode', () => {
    // Create a site, then create a VC and switch into VC edit mode.
    const store = useEditorStore.getState()
    store.createSite('VC Insert Test')
    const vcId = store.createVisualComponent('TestCard')
    store.setActiveDocument({ kind: 'visualComponent', vcId })

    // Sanity: activeDocument is now the VC
    expect(useEditorStore.getState().activeDocument).toEqual({
      kind: 'visualComponent',
      vcId,
    })

    // Insert a Slot via the same hook the toolbar/ModulePicker uses.
    const slotMod = registry.get('base.slot-outlet')
    expect(slotMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedNodeId: string | null = null
    act(() => {
      insertedNodeId = result.current(slotMod!)
    })

    expect(insertedNodeId).toBeTruthy()

    // The slot must be inside the VC tree…
    const state = useEditorStore.getState()
    const vc = state.site!.visualComponents.find((v) => v.id === vcId)!
    const vcRoot = vc.tree.nodes[vc.tree.rootNodeId]
    // Root node lists the inserted slot as a child
    expect(vcRoot.children).toContain(insertedNodeId)
    // The node itself is registered in the flat nodes map
    const insertedNode = vc.tree.nodes[insertedNodeId!]
    expect(insertedNode).toBeDefined()
    expect(insertedNode?.moduleId).toBe('base.slot-outlet')

    // …and NOT in any page tree.
    for (const page of state.site!.pages) {
      expect(page.nodes[insertedNodeId!]).toBeUndefined()
    }

    // Selection follows the inserted node so the Properties panel shows it.
    expect(state.selectedNodeId).toBe(insertedNodeId)
  })
})

describe('useInsertModule — single outlet guard', () => {
  function countOutlets(): number {
    const state = useEditorStore.getState()
    const page = state.site!.pages.find((p) => p.id === state.activePageId)!
    return Object.values(page.nodes).filter((n) => n.moduleId === 'base.outlet').length
  }

  it('inserts the first base.outlet but blocks a second one', () => {
    useEditorStore.getState().createSite('Outlet Guard Test')
    const outletMod = registry.get('base.outlet')
    expect(outletMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())

    // First outlet inserts normally.
    let firstId: string | null = null
    act(() => { firstId = result.current(outletMod!) })
    expect(firstId).toBeTruthy()
    expect(countOutlets()).toBe(1)

    // Second outlet is blocked: the hook returns null and the tree is unchanged.
    let secondId: string | null = 'sentinel'
    act(() => { secondId = result.current(outletMod!) })
    expect(secondId).toBeNull()
    expect(countOutlets()).toBe(1)
  })

  it('store insertNode backstop refuses a second base.outlet even when called directly', () => {
    useEditorStore.getState().createSite('Outlet Backstop Test')
    const store = useEditorStore.getState()
    const rootId = store.site!.pages.find((p) => p.id === store.activePageId)!.rootNodeId

    const first = store.insertNode('base.outlet', {}, rootId)
    expect(first).toBeTruthy()
    expect(countOutlets()).toBe(1)

    // Direct store call (bypassing the hook) is still blocked: returns '' and
    // leaves the single existing outlet in place.
    const second = store.insertNode('base.outlet', {}, rootId)
    expect(second).toBe('')
    expect(countOutlets()).toBe(1)
  })
})

describe('useInsertModule — VC ref redirect', () => {
  /**
   * Builds a page with a VC ref that has two slot-instance children:
   *   vcRef (base.visual-component-ref)
   *     slot-1 (base.slot-instance, slotName: 'children', locked)
   *     slot-2 (base.slot-instance, slotName: 'actions', locked)
   */
  function setupPageWithVcRef() {
    useEditorStore.setState({
      site: makeSite({
        pages: [
          makePage({
            id: 'page-vc',
            rootNodeId: 'root',
            nodes: {
              root: makeNode({ id: 'root', moduleId: 'base.body', children: ['vc-ref'] }),
              'vc-ref': makeNode({
                id: 'vc-ref',
                moduleId: 'base.visual-component-ref',
                props: { componentId: 'vc-1' },
                children: ['slot-1', 'slot-2'],
              }),
              'slot-1': makeNode({
                id: 'slot-1',
                moduleId: 'base.slot-instance',
                props: { slotName: 'children' },
                children: [],
                locked: true,
              }),
              'slot-2': makeNode({
                id: 'slot-2',
                moduleId: 'base.slot-instance',
                props: { slotName: 'actions' },
                children: [],
                locked: true,
              }),
            },
          }),
        ],
      }),
      activePageId: 'page-vc',
      activeDocument: null,
      selectedNodeId: null,
    selectedNodeIds: [],
      hoveredNodeId: null,
      propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
      packageJson: {},
      _historyPast: [],
      _historyFuture: [],
      canUndo: false,
      canRedo: false,
      hasUnsavedChanges: false,
    } as Parameters<typeof useEditorStore.setState>[0])
  }

  it('Test A: inserts into the first slot-instance when the selected node is a VC ref', () => {
    setupPageWithVcRef()
    useEditorStore.setState({ selectedNodeId: 'vc-ref' } as Parameters<typeof useEditorStore.setState>[0])

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null = null
    act(() => { insertedId = result.current(textMod!) })

    const state = useEditorStore.getState()
    const page = state.site!.pages.find((p) => p.id === 'page-vc')!

    // New node must be a child of slot-1 (the first slot-instance)
    expect(page.nodes['slot-1'].children).toContain(insertedId)

    // VC ref's direct children must be unchanged — still just the two slot-instances
    expect(page.nodes['vc-ref'].children).toEqual(['slot-1', 'slot-2'])
  })

  it('Test B: inserts into the first slot-instance when explicit parent is a VC ref', () => {
    setupPageWithVcRef()

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null = null
    // Pass the VC ref id as the explicit parent
    act(() => { insertedId = result.current(textMod!, 'vc-ref') })

    const state = useEditorStore.getState()
    const page = state.site!.pages.find((p) => p.id === 'page-vc')!

    expect(page.nodes['slot-1'].children).toContain(insertedId)
    expect(page.nodes['vc-ref'].children).toEqual(['slot-1', 'slot-2'])
  })

  it('Test C: inserts as the next sibling when VC ref has no slot-instance children', () => {
    // A VC ref with no slot-instances has nowhere to nest user content (the
    // referenced VC declares no slot params). Treating the ref like a leaf
    // and placing the new node as a sibling-after under its parent is the
    // expected behaviour — silently no-op'ing on the click was the bug.
    useEditorStore.setState({
      site: makeSite({
        pages: [
          makePage({
            id: 'page-empty-vc',
            rootNodeId: 'root',
            nodes: {
              root: makeNode({ id: 'root', moduleId: 'base.body', children: ['vc-ref'] }),
              'vc-ref': makeNode({
                id: 'vc-ref',
                moduleId: 'base.visual-component-ref',
                props: { componentId: 'vc-1' },
                children: [],
              }),
            },
          }),
        ],
      }),
      activePageId: 'page-empty-vc',
      activeDocument: null,
      selectedNodeId: 'vc-ref',
      hoveredNodeId: null,
      propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
      packageJson: {},
      _historyPast: [],
      _historyFuture: [],
      canUndo: false,
      canRedo: false,
      hasUnsavedChanges: false,
    } as Parameters<typeof useEditorStore.setState>[0])

    const textMod = registry.get('base.text')
    expect(textMod).toBeTruthy()

    const { result } = renderHook(() => useInsertModule())
    let insertedId: string | null | undefined
    act(() => { insertedId = result.current(textMod!) })

    // The hook must return the new node's id (insertion happened).
    expect(insertedId).toBeTruthy()

    const state = useEditorStore.getState()
    const page = state.site!.pages[0]

    // VC ref still has no children (the new node is its sibling, not a child).
    const vcRef = page.nodes['vc-ref']
    expect(vcRef.children).toEqual([])

    // New node lands as the next sibling of vc-ref under root.
    const root = page.nodes['root']
    expect(root.children.length).toBe(2)
    expect(root.children[0]).toBe('vc-ref')
    expect(root.children[1]).toBe(insertedId!)
    expect(page.nodes[insertedId!].moduleId).toBe('base.text')
  })
})

