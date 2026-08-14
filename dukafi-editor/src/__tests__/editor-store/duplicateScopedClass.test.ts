/**
 * Editor-store integration test for F-0005.
 *
 * `duplicateNode`, `duplicateNodes`, and `duplicatePage` must clone every
 * per-node "module-style" CSS class alongside the cloned nodes — otherwise
 * the duplicate's `classIds` keep referencing the source's scoped class and
 * editing one node's per-node style restyles both. Mirrors the contract
 * already satisfied by `clipboardSlice.pasteNode` and
 * `visualComponentsSlice.convertNodeToComponent`.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import '@modules/base/index'

function freshStore() {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeDocument: null,
    clipboardEntry: null,
    activeClassId: null,
    previewClassAssignment: null,
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 280 },
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(freshStore)

// ---------------------------------------------------------------------------
// duplicateNode — single node with a scoped (module-style) class
// ---------------------------------------------------------------------------

describe('duplicateNode — scoped class cloning (F-0005)', () => {
  it('duplicate references a fresh scoped class with scope.nodeId remapped to the duplicate', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Dup Site')
    const rootId = site.pages[0].rootNodeId

    const sourceId = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const sourceClass = useEditorStore.getState().ensureNodeStyleClass(sourceId, 'Container')
    expect(sourceClass).not.toBeNull()
    expect(sourceClass!.scope?.nodeId).toBe(sourceId)

    const duplicateId = useEditorStore.getState().duplicateNode(sourceId)
    expect(duplicateId).toBeTruthy()
    expect(duplicateId).not.toBe(sourceId)

    const stateAfter = useEditorStore.getState()
    const page = stateAfter.site!.pages[0]
    const duplicate = page.nodes[duplicateId]
    const source = page.nodes[sourceId]

    // Duplicate must NOT carry the source's scoped class id verbatim.
    expect(duplicate.classIds).not.toContain(sourceClass!.id)
    expect(source.classIds).toContain(sourceClass!.id)

    // Duplicate carries some class id; that class is scoped to the duplicate.
    expect(duplicate.classIds.length).toBeGreaterThan(0)
    const duplicateScopedClass = duplicate.classIds
      .map((cid) => stateAfter.site!.styleRules[cid])
      .find((cls) => cls?.scope?.type === 'node' && cls.scope.role === 'module-style')
    expect(duplicateScopedClass).toBeDefined()
    expect(duplicateScopedClass!.scope?.nodeId).toBe(duplicateId)
    // …and is a different class registry entry from the source's class.
    expect(duplicateScopedClass!.id).not.toBe(sourceClass!.id)

    // Source's scoped class is still in the registry, scope unchanged.
    const refreshedSourceClass = stateAfter.site!.styleRules[sourceClass!.id]
    expect(refreshedSourceClass).toBeDefined()
    expect(refreshedSourceClass.scope?.nodeId).toBe(sourceId)
  })

  it('editing the duplicate\'s scoped class does NOT mutate the source\'s class', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Dup Site')
    const rootId = site.pages[0].rootNodeId

    const sourceId = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const sourceClass = useEditorStore.getState().ensureNodeStyleClass(sourceId, 'Container')!
    useEditorStore.getState().updateClassStyles(sourceClass.id, { backgroundColor: 'red' })

    const duplicateId = useEditorStore.getState().duplicateNode(sourceId)
    const duplicate = useEditorStore.getState().site!.pages[0].nodes[duplicateId]
    const duplicateScopedClassId = duplicate.classIds.find((cid) => {
      const cls = useEditorStore.getState().site!.styleRules[cid]
      return cls?.scope?.type === 'node'
    })!

    // Edit the duplicate's class.
    useEditorStore.getState().updateClassStyles(duplicateScopedClassId, { backgroundColor: 'blue' })

    const sourceClassAfter = useEditorStore.getState().site!.styleRules[sourceClass.id]
    expect(sourceClassAfter.styles.backgroundColor).toBe('red')

    const duplicateClassAfter = useEditorStore.getState().site!.styleRules[duplicateScopedClassId]
    expect(duplicateClassAfter.styles.backgroundColor).toBe('blue')
  })

  it('reusable (non-scoped) classes are SHARED — same class id on both nodes', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Dup Site')
    const rootId = site.pages[0].rootNodeId

    const sourceId = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const reusable = useEditorStore.getState().createClass('shared-style')
    useEditorStore.getState().addNodeClass(sourceId, reusable.id)

    const duplicateId = useEditorStore.getState().duplicateNode(sourceId)
    const page = useEditorStore.getState().site!.pages[0]

    expect(page.nodes[sourceId].classIds).toContain(reusable.id)
    expect(page.nodes[duplicateId].classIds).toContain(reusable.id)
    // Class registry has not gained an extra reusable copy.
    const reusableMatches = Object.values(useEditorStore.getState().site!.styleRules).filter(
      (c) => c.name === 'shared-style',
    )
    expect(reusableMatches).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// duplicateNodes — multi-select duplicate
// ---------------------------------------------------------------------------

describe('duplicateNodes — scoped class cloning (F-0005)', () => {
  it('each duplicate gets its own fresh scoped class', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Dup Site')
    const rootId = site.pages[0].rootNodeId

    const a = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const b = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const aClass = useEditorStore.getState().ensureNodeStyleClass(a, 'Container')!
    const bClass = useEditorStore.getState().ensureNodeStyleClass(b, 'Container')!

    const newIds = useEditorStore.getState().duplicateNodes([a, b])
    expect(newIds).toHaveLength(2)

    const stateAfter = useEditorStore.getState()
    const page = stateAfter.site!.pages[0]
    for (const dupId of newIds) {
      const dup = page.nodes[dupId]
      expect(dup.classIds).not.toContain(aClass.id)
      expect(dup.classIds).not.toContain(bClass.id)
      const scopedClassId = dup.classIds.find((cid) => {
        const cls = stateAfter.site!.styleRules[cid]
        return cls?.scope?.type === 'node'
      })
      expect(scopedClassId).toBeDefined()
      const scopedClass = stateAfter.site!.styleRules[scopedClassId!]
      expect(scopedClass.scope?.nodeId).toBe(dupId)
    }
  })
})

// ---------------------------------------------------------------------------
// duplicatePage — page-level duplicate
// ---------------------------------------------------------------------------

describe('duplicatePage — scoped class cloning (F-0005)', () => {
  it('cloned page\'s nodes reference fresh scoped classes pointing at the new node ids', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Dup Site')
    const sourcePage = site.pages[0]
    const rootId = sourcePage.rootNodeId

    const containerId = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const sourceClass = useEditorStore.getState().ensureNodeStyleClass(containerId, 'Container')!

    const newPage = useEditorStore.getState().duplicatePage(sourcePage.id, 'Copy', 'copy')
    expect(newPage.id).not.toBe(sourcePage.id)

    const stateAfter = useEditorStore.getState()
    const dupPage = stateAfter.site!.pages.find((p) => p.id === newPage.id)!
    const dupRootChildren = dupPage.nodes[dupPage.rootNodeId].children
    expect(dupRootChildren).toHaveLength(1)
    const dupContainerId = dupRootChildren[0]
    const dupContainer = dupPage.nodes[dupContainerId]

    // Duplicate page's container does NOT carry the source page's scoped class id.
    expect(dupContainer.classIds).not.toContain(sourceClass.id)

    // It DOES carry a fresh scoped class id whose scope.nodeId points at the new node.
    const dupScopedClassId = dupContainer.classIds.find((cid) => {
      const cls = stateAfter.site!.styleRules[cid]
      return cls?.scope?.type === 'node'
    })
    expect(dupScopedClassId).toBeDefined()
    const dupScopedClass = stateAfter.site!.styleRules[dupScopedClassId!]
    expect(dupScopedClass.scope?.nodeId).toBe(dupContainerId)

    // Source page's class is still in the registry, unchanged.
    const sourceClassAfter = stateAfter.site!.styleRules[sourceClass.id]
    expect(sourceClassAfter.scope?.nodeId).toBe(containerId)
  })
})
