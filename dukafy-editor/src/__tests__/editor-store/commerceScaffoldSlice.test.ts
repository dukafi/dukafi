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
 *   4. insertCartScaffold: a cartItems loop + a subtotal bound to the `cart`
 *      frame, all plain rebindable nodes (Dukafy ships no cart component).
 *   5. Repeated inserts mint fresh, non-colliding node ids.
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

  it('inserts a cart as plain nodes: a cartItems loop plus a cart-frame subtotal', () => {
    seedSite()

    const rootId = useEditorStore.getState().insertCartScaffold()!
    const page = useEditorStore.getState().site!.pages[0]
    const root = page.nodes[rootId]

    expect(root.moduleId).toBe('base.container')
    // Marked as the cart region, which is what makes the summary render at
    // all: a baked page is one file for every visitor, so anything reading
    // the `cart` frame needs a subtree the browser re-fetches per visitor.
    // Without this the scaffold looks right on canvas and publishes blank.
    expect(root.actions?.region).toBe('cart')
    expect(root.children).toHaveLength(3)
    const [loop, count, subtotal] = root.children.map((id) => page.nodes[id])

    // Lines come from the generalized relationship loop, not a cart module.
    expect(loop.moduleId).toBe('store.relationship-loop')
    expect(loop.props).toMatchObject({ relationship: 'cartItems', sourceSlug: '' })

    // Per-line fields read from currentEntry — inside the loop that IS one line.
    const row = page.nodes[loop.children[0]]
    expect(row.moduleId).toBe('base.container')
    const rowNodes = row.children.map((id) => page.nodes[id])
    expect(rowNodes.slice(0, 4).map((n) => n.dynamicBindings?.text)).toMatchObject([
      { source: 'currentEntry', field: 'title' },
      { source: 'currentEntry', field: 'variantTitle' },
      { source: 'currentEntry', field: 'quantity' },
      { source: 'currentEntry', field: 'linePriceDisplay' },
    ])

    // The controls are plain buttons carrying cart verbs — no bespoke stepper
    // or remove component. Merchants restyle/relabel/delete them freely.
    const controls = rowNodes.slice(4)
    expect(controls.map((n) => n.moduleId)).toEqual(['base.button', 'base.button', 'base.button'])
    expect(controls.map((n) => n.actions?.click)).toMatchObject([
      { type: 'cart.setQuantity', delta: -1 },
      { type: 'cart.setQuantity', delta: 1 },
      { type: 'cart.removeItem' },
    ])

    // Count and subtotal are cart-wide, so they must sit OUTSIDE the loop and
    // read from the `cart` frame — currentEntry would be a single line, and a
    // node inside the loop would repeat once per line.
    expect(count.dynamicBindings?.text).toMatchObject({ source: 'cart', field: 'count' })
    expect(subtotal.dynamicBindings?.text).toMatchObject({
      source: 'cart',
      field: 'subtotalDisplay',
    })
  })

  it('inserts a cart made only of ordinary, restylable nodes', () => {
    seedSite()

    const rootId = useEditorStore.getState().insertCartScaffold()!
    const page = useEditorStore.getState().site!.pages[0]

    // Walk the whole inserted subtree: nothing may be a bespoke cart module.
    const walk = (id: string): string[] => [
      page.nodes[id].moduleId,
      ...page.nodes[id].children.flatMap(walk),
    ]
    const moduleIds = walk(rootId)
    expect(moduleIds.every((m) => m.startsWith('base.') || m === 'store.relationship-loop')).toBe(true)
    expect(moduleIds).not.toContain('store.cart-drawer')
  })
})

/**
 * `region` marks a node as a live area — the subtree the browser re-fetches
 * per visitor. It is INDEPENDENT of `click`: one node can both be a cart
 * region and carry a verb, so neither setter may clobber the other.
 */
describe('node region markers', () => {
  function seedNode() {
    seedSite()
    const id = useEditorStore.getState().insertProductScaffold()!
    return id
  }

  it('sets and clears a cart region', () => {
    const id = seedNode()
    const store = () => useEditorStore.getState()

    store().setNodeRegion(id, 'cart')
    expect(store().site!.pages[0].nodes[id].actions?.region).toBe('cart')

    store().clearNodeRegion(id)
    expect(store().site!.pages[0].nodes[id].actions?.region).toBeUndefined()
  })

  it('keeps a region when a click verb is attached and removed', () => {
    const id = seedNode()
    const store = () => useEditorStore.getState()

    store().setNodeRegion(id, 'cart')
    store().setNodeAction(id, { type: 'cart.createOrder' })
    const withBoth = store().site!.pages[0].nodes[id]
    expect(withBoth.actions?.region).toBe('cart')
    expect(withBoth.actions?.click).toMatchObject({ type: 'cart.createOrder' })

    // Clearing the verb must not unmark the region — they are separate ideas
    // that happen to share the `actions` bag.
    store().clearNodeAction(id)
    const after = store().site!.pages[0].nodes[id]
    expect(after.actions?.click).toBeUndefined()
    expect(after.actions?.region).toBe('cart')
  })

  it('drops the actions bag entirely once nothing is left in it', () => {
    const id = seedNode()
    const store = () => useEditorStore.getState()

    store().setNodeAction(id, { type: 'cart.createOrder' })
    store().clearNodeAction(id)
    expect(store().site!.pages[0].nodes[id].actions).toBeUndefined()
  })
})

/**
 * `visibleWhen` — whether a node renders at all. The mechanism behind
 * "show this when the item is in the cart, that when it isn't", built from
 * two ordinary nodes instead of a bespoke component.
 */
describe('node render conditions', () => {
  function seedNode() {
    seedSite()
    return useEditorStore.getState().insertProductScaffold()!
  }

  it('sets, updates and clears a condition', () => {
    const id = seedNode()
    const store = () => useEditorStore.getState()
    const node = () => store().site!.pages[0].nodes[id]

    store().setNodeVisibility(id, { source: 'currentEntry', field: 'inCart', operator: 'isTrue' })
    expect(node().visibleWhen).toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isTrue' })

    store().setNodeVisibility(id, { source: 'cart', field: 'count', operator: 'greaterThan', value: '2' })
    expect(node().visibleWhen).toMatchObject({ source: 'cart', operator: 'greaterThan', value: '2' })

    store().clearNodeVisibility(id)
    expect(node().visibleWhen).toBeUndefined()
  })

  it('is independent of actions and regions on the same node', () => {
    const id = seedNode()
    const store = () => useEditorStore.getState()

    store().setNodeVisibility(id, { source: 'currentEntry', field: 'inCart', operator: 'isFalse' })
    store().setNodeAction(id, { type: 'cart.addItem', quantity: 1 })
    store().setNodeRegion(id, 'cart')

    const node = store().site!.pages[0].nodes[id]
    expect(node.visibleWhen?.operator).toBe('isFalse')
    expect(node.actions?.click).toMatchObject({ type: 'cart.addItem' })
    expect(node.actions?.region).toBe('cart')

    // Clearing one must not disturb the others.
    store().clearNodeAction(id)
    const after = store().site!.pages[0].nodes[id]
    expect(after.visibleWhen?.operator).toBe('isFalse')
    expect(after.actions?.region).toBe('cart')
  })
})

/**
 * Block insertion must survive PARTIAL props.
 *
 * Modules inserted normally go through `createNode`, which merges module
 * defaults. Blocks bypass that — `insertSnapshotSubtrees` writes nodes
 * verbatim — so a hand-written block listing only the props its author cared
 * about produced nodes missing everything else. `base.form` without `formId`
 * crashed the canvas renderer outright (`.replace` of undefined).
 */
describe('insertBlock fills module defaults', () => {
  function blockWith(moduleId: string, props: Record<string, unknown>) {
    return {
      dukafyExport: 'block' as const,
      version: 1,
      exportedAt: 0,
      block: {
        name: 'Partial',
        rootNodeIds: ['n1'],
        nodes: {
          n1: {
            id: 'n1', moduleId, props,
            breakpointOverrides: {}, children: [], classIds: [],
          },
        },
        classes: {},
      },
    }
  }

  it('completes props the block omitted', () => {
    seedSite()
    // Exactly the shape that crashed: a custom-mode form with no formId.
    const id = useEditorStore.getState().insertBlock(
      blockWith('base.form', { mode: 'custom', method: 'post' }),
    )!
    const node = useEditorStore.getState().site!.pages[0].nodes[id]

    expect(node.props.formId).toBeDefined()
    expect(node.props.honeypotName).toBeDefined()
  })

  it('never lets a default overwrite an authored value', () => {
    seedSite()
    const id = useEditorStore.getState().insertBlock(
      blockWith('base.form', { mode: 'custom', formId: 'checkout' }),
    )!
    const node = useEditorStore.getState().site!.pages[0].nodes[id]

    expect(node.props.mode).toBe('custom')
    expect(node.props.formId).toBe('checkout')
  })
})
