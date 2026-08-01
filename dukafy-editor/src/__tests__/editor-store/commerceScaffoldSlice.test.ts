/**
 * commerceScaffoldSlice — "Insert product" / "Insert collection" / "Insert
 * variant list" from the module picker.
 *
 * Covers:
 *   1. insertProductScaffold: a base.link root wrapping bound image/title/
 *      price children, each wired via dynamicBindings to a currentEntry field.
 *   2. insertRelationshipLoop('products'): a store.relationship-loop wrapping
 *      the same product row as its child.
 *   3. insertRelationshipLoop('variants'): a store.relationship-loop wrapping
 *      a plain title/price row (no image, no link).
 *   4. Repeated inserts mint fresh, non-colliding node ids.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import '@modules/base/index'
import '@modules/store/index'

function freshStore() {
  localStorage.clear()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeDocument: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(freshStore)

function seedSite() {
  const store = useEditorStore.getState()
  const site = store.createSite('Commerce Scaffold Site')
  const rootId = site.pages[0].rootNodeId
  useEditorStore.getState().selectNode(rootId)
  return { rootId }
}

describe('commerceScaffoldSlice.insertProductScaffold', () => {
  it('inserts a linked product row with bound image/title/price children', () => {
    const { rootId } = seedSite()

    const newRootId = useEditorStore.getState().insertProductScaffold()
    expect(newRootId).not.toBeNull()

    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[rootId].children).toContain(newRootId!)

    const root = page.nodes[newRootId!]
    expect(root.moduleId).toBe('base.link')
    expect(root.dynamicBindings?.href).toEqual({ source: 'currentEntry', field: 'href', format: 'url', fallback: 'static' })
    expect(root.children).toHaveLength(3)

    const [image, title, price] = root.children.map((id) => page.nodes[id])
    expect(image.moduleId).toBe('base.image')
    expect(image.dynamicBindings?.src).toEqual({ source: 'currentEntry', field: 'imageUrl', format: 'media', fallback: 'empty' })
    expect(title.moduleId).toBe('base.text')
    expect(title.dynamicBindings?.text).toEqual({ source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' })
    expect(price.moduleId).toBe('base.text')
    expect(price.dynamicBindings?.text).toEqual({ source: 'currentEntry', field: 'priceDisplay', format: 'plain', fallback: 'static' })

    expect(useEditorStore.getState().selectedNodeId).toBe(newRootId)
  })

  it('mints fresh, non-colliding node ids on repeated inserts', () => {
    seedSite()
    const first = useEditorStore.getState().insertProductScaffold()!
    useEditorStore.getState().selectNode(useEditorStore.getState().site!.pages[0].rootNodeId)
    const second = useEditorStore.getState().insertProductScaffold()!

    expect(first).not.toBe(second)
    const page = useEditorStore.getState().site!.pages[0]
    expect(page.nodes[first]).toBeDefined()
    expect(page.nodes[second]).toBeDefined()
    // Every descendant id across both inserts is unique.
    const allIds = [first, ...page.nodes[first].children, second, ...page.nodes[second].children]
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('commerceScaffoldSlice.insertRelationshipLoop', () => {
  it('inserts a products loop wrapping a linked product row', () => {
    seedSite()

    const newRootId = useEditorStore.getState().insertRelationshipLoop('products')
    expect(newRootId).not.toBeNull()

    const page = useEditorStore.getState().site!.pages[0]
    const loop = page.nodes[newRootId!]
    expect(loop.moduleId).toBe('store.relationship-loop')
    expect(loop.props).toEqual({
      relationship: 'products',
      sourceSlug: '',
      perPage: 12,
      orderBy: 'manual',
      direction: 'asc',
      offset: 0,
    })
    expect(loop.children).toHaveLength(1)

    const row = page.nodes[loop.children[0]]
    expect(row.moduleId).toBe('base.link')
    expect(row.children).toHaveLength(3)
  })

  it('inserts a variants loop wrapping a plain title/price row', () => {
    seedSite()

    const newRootId = useEditorStore.getState().insertRelationshipLoop('variants')!
    const page = useEditorStore.getState().site!.pages[0]
    const loop = page.nodes[newRootId]
    expect(loop.props).toEqual({
      relationship: 'variants',
      sourceSlug: '',
      perPage: 12,
      orderBy: 'manual',
      direction: 'asc',
      offset: 0,
    })

    const row = page.nodes[loop.children[0]]
    expect(row.moduleId).toBe('base.container')
    expect(row.dynamicBindings).toBeUndefined()
    expect(row.children).toHaveLength(2)
    const [title, price] = row.children.map((id) => page.nodes[id])
    expect(title.dynamicBindings?.text).toMatchObject({ field: 'title' })
    expect(price.dynamicBindings?.text).toMatchObject({ field: 'priceDisplay' })
  })
})
