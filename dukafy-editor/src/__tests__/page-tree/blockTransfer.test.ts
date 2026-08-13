/**
 * Block transfer.
 *
 * The point of a block file over a copy/paste is that it carries the OVERLAYS
 * that make a subtree commerce rather than markup: dynamic bindings, cart
 * verbs, live-region markers, render conditions, and loop sources. If any of
 * those are lost in transit the block looks right and does nothing, which is
 * the worst possible failure — so this walks a realistic block carrying all of
 * them through export → JSON → parse and checks each one survives.
 */

import { describe, expect, it } from 'bun:test'
import { buildBlockExport, parseBlockExport } from '@core/page-tree'
import type { PageNode, StyleRule } from '@core/page-tree'

function node(id: string, moduleId: string, children: string[] = [], extra: Partial<PageNode> = {}): PageNode {
  return { id, moduleId, props: {}, breakpointOverrides: {}, children, classIds: [], ...extra }
}

/**
 * A product card that actually does something: a products loop, a row whose
 * title binds to the entry, an add button carrying a cart verb, a live region,
 * and two branches conditioned on whether the item is already in the cart.
 */
function commerceBlockNodes(): Record<string, PageNode> {
  return {
    root: node('root', 'store.relationship-loop', ['row'], {
      props: { source: 'collections/featured.products', perPage: 12 },
      classIds: ['grid'],
    }),
    row: node('row', 'base.container', ['title', 'region']),
    title: node('title', 'base.text', [], {
      props: { text: 'Product title', tag: 'h3' },
      dynamicBindings: { text: { source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static' } },
    }),
    region: node('region', 'base.container', ['inCart', 'add'], {
      actions: { region: 'cart' },
    }),
    inCart: node('inCart', 'base.text', [], {
      props: { text: 'In cart', tag: 'p' },
      visibleWhen: { source: 'currentEntry', field: 'inCart', operator: 'isTrue' },
      dynamicBindings: { text: { source: 'currentEntry', field: 'cartQuantity' } },
    }),
    add: node('add', 'base.button', [], {
      props: { label: 'Add to cart' },
      visibleWhen: { source: 'currentEntry', field: 'inCart', operator: 'isFalse' },
      actions: { click: { type: 'cart.addItem', quantity: 1 } },
    }),
  }
}

function styleRule(id: string): StyleRule {
  return { id, name: id, kind: 'class', selector: `.${id}`, order: 0, declarations: {} } as StyleRule
}

const CLASSES: Record<string, StyleRule> = {
  grid: styleRule('grid'),
  unused: styleRule('unused'),
}

/** Export → serialise → parse, exactly as a file round-trip would. */
function roundTrip(nodes: Record<string, PageNode>, roots = ['root']) {
  const exported = buildBlockExport('Product card', roots, nodes, CLASSES)
  const parsed = parseBlockExport(JSON.parse(JSON.stringify(exported)))
  expect(parsed).not.toBeNull()
  return parsed!
}

describe('buildBlockExport', () => {
  it('captures the whole subtree from the given root', () => {
    const exported = buildBlockExport('Product card', ['root'], commerceBlockNodes(), CLASSES)

    expect(exported.dukafyExport).toBe('block')
    expect(exported.block.rootNodeIds).toEqual(['root'])
    expect(Object.keys(exported.block.nodes).sort())
      .toEqual(['add', 'inCart', 'region', 'root', 'row', 'title'])
  })

  it('carries only the classes the block actually references', () => {
    const exported = buildBlockExport('Product card', ['root'], commerceBlockNodes(), CLASSES)

    expect(Object.keys(exported.block.classes)).toEqual(['grid'])
  })

  it('skips roots that are not in the tree rather than throwing', () => {
    const exported = buildBlockExport('X', ['root', 'ghost'], commerceBlockNodes(), CLASSES)

    expect(exported.block.rootNodeIds).toEqual(['root'])
  })
})

describe('block round-trip preserves every overlay', () => {
  it('keeps loop source props', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.root.props).toMatchObject({
      source: 'collections/featured.products',
      perPage: 12,
    })
  })

  it('keeps dynamic bindings', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.title.dynamicBindings?.text).toEqual({
      source: 'currentEntry', field: 'title', format: 'plain', fallback: 'static',
    })
    expect(parsed.block.nodes.inCart.dynamicBindings?.text)
      .toMatchObject({ source: 'currentEntry', field: 'cartQuantity' })
  })

  it('keeps cart verbs', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.add.actions?.click).toMatchObject({ type: 'cart.addItem', quantity: 1 })
  })

  it('keeps the live-region marker', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.region.actions?.region).toBe('cart')
  })

  it('keeps render conditions on both branches', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.inCart.visibleWhen)
      .toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isTrue' })
    expect(parsed.block.nodes.add.visibleWhen)
      .toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isFalse' })
  })

  it('keeps class references and the rules behind them', () => {
    const parsed = roundTrip(commerceBlockNodes())
    expect(parsed.block.nodes.root.classIds).toEqual(['grid'])
    expect(parsed.block.classes.grid).toBeDefined()
  })
})

describe('parseBlockExport', () => {
  it('rejects anything that is not a block file', () => {
    expect(parseBlockExport(null)).toBeNull()
    expect(parseBlockExport({ dukafyExport: 'page', page: {} })).toBeNull()
    expect(parseBlockExport({ dukafyExport: 'block' })).toBeNull()
    expect(parseBlockExport({ dukafyExport: 'block', block: { rootNodeIds: [], nodes: {} } })).toBeNull()
  })

  it('drops a malformed node but keeps the rest of the block', () => {
    const exported = buildBlockExport('X', ['root'], commerceBlockNodes(), CLASSES)
    const raw = JSON.parse(JSON.stringify(exported))
    raw.block.nodes.title = { nonsense: true }

    const parsed = parseBlockExport(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.block.nodes.title).toBeUndefined()
    // The rest is intact — one bad node must not cost the whole block.
    expect(parsed!.block.nodes.add.actions?.click).toMatchObject({ type: 'cart.addItem' })
  })

  it('returns null when no declared root survived parsing', () => {
    const exported = buildBlockExport('X', ['root'], commerceBlockNodes(), CLASSES)
    const raw = JSON.parse(JSON.stringify(exported))
    raw.block.nodes.root = { nonsense: true }

    // A block whose root is gone would insert nothing; that is a failed
    // import, not a silently empty one.
    expect(parseBlockExport(raw)).toBeNull()
  })

  it('falls back to a usable name when none is given', () => {
    const exported = buildBlockExport('   ', ['root'], commerceBlockNodes(), CLASSES)
    expect(exported.block.name).toBe('Block')
  })
})
