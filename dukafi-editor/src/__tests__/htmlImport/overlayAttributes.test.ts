/**
 * Commerce overlays written as HTML attributes.
 *
 * This is the one thing HTML cannot say on its own, and therefore the one
 * addition needed before an author — or a model — can describe a whole Dukafi
 * page in markup. The rule these tests pin: an attribute can only produce an
 * overlay the persisted document could already hold, because both go through
 * the same parsers.
 */

import { describe, expect, it } from 'bun:test'
import '@modules/base'
// Loops are store modules; the importer resolves the id against the registry.
import '@modules/store'
import { importHtml } from '@core/htmlImport'
import type { PageNode } from '@core/page-tree'

function only(html: string): PageNode {
  const result = importHtml(html)
  const roots = result.rootIds.map((id) => result.nodes[id]!)
  expect(roots.length).toBeGreaterThan(0)
  return roots[0]!
}

describe('overlay attributes', () => {
  it('turns an action attribute into a node action', () => {
    const node = only('<button data-dukafy-action="cart.addItem">Add</button>')

    expect(node.actions?.click).toEqual({ type: 'cart.addItem' })
  })

  it('reads numeric action parameters as numbers', () => {
    const node = only('<button data-dukafy-action="cart.setQuantity" data-dukafy-action-delta="-1">−</button>')

    expect(node.actions?.click).toEqual({ type: 'cart.setQuantity', delta: -1 })
  })

  it('camel-cases hyphenated action parameters', () => {
    const node = only(
      '<button data-dukafy-action="cart.addItem" data-dukafy-action-product-slug="canvas-bag">Add</button>',
    )

    expect(node.actions?.click?.productSlug).toBe('canvas-bag')
  })

  it('marks a live region', () => {
    expect(only('<div data-dukafy-region="cart"></div>').actions?.region).toBe('cart')
  })

  it('reads a render condition', () => {
    const node = only('<div data-dukafy-visible-when="currentEntry.inCart:isTrue"></div>')

    expect(node.visibleWhen).toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isTrue' })
  })

  it('reads a condition that compares against a value', () => {
    const node = only('<div data-dukafy-visible-when="cart.count:greaterThan:2"></div>')

    expect(node.visibleWhen).toEqual({
      source: 'cart', field: 'count', operator: 'greaterThan', value: '2',
    })
  })

  it('binds a prop to a data field', () => {
    const node = only('<p data-dukafy-bind-text="currentEntry.cartQuantity"></p>')

    expect(node.dynamicBindings?.text).toEqual({ source: 'currentEntry', field: 'cartQuantity' })
  })

  it('keeps a dotted field path intact', () => {
    const node = only('<p data-dukafy-bind-text="cart.totals.grand"></p>')

    expect(node.dynamicBindings?.text).toEqual({ source: 'cart', field: 'totals.grand' })
  })

  // ── The overlay must not ALSO publish as raw markup ──────────────────────

  // Left in htmlAttributes these would be re-emitted verbatim, duplicating the
  // overlay — and `data-dukafy-region` would collide with the attribute the
  // publisher writes for the live region it drives.
  it('consumes the attributes instead of leaving them on the element', () => {
    const node = only(
      '<button data-dukafy-action="cart.addItem" data-dukafy-action-quantity="1" ' +
        'data-dukafy-visible-when="currentEntry.inCart:isFalse" id="add">Add</button>',
    )

    const attrs = (node.props.htmlAttributes ?? {}) as Record<string, string>
    expect(Object.keys(attrs).some((name) => name.startsWith('data-dukafy-'))).toBe(false)
    // Unrelated attributes still survive.
    expect(attrs.id).toBe('add')
  })

  // ── Tolerance ────────────────────────────────────────────────────────────

  // A typo in one attribute must not cost the author the whole element.
  it('drops an unrecognised verb but keeps the element', () => {
    const node = only('<button data-dukafy-action="cart.setFire">Add</button>')

    expect(node.actions).toBeUndefined()
    expect(node.moduleId).toBe('base.button')
  })

  it('drops a malformed condition without hiding the node', () => {
    // A condition that failed to parse must leave the node VISIBLE — the same
    // choice `parseNodeVisibility` and the publisher make, because a node that
    // silently vanishes looks deleted with nothing to debug.
    expect(only('<div data-dukafy-visible-when="nonsense"></div>').visibleWhen).toBeUndefined()
    expect(only('<div data-dukafy-visible-when="cart.count:notAnOperator"></div>').visibleWhen).toBeUndefined()
  })

  it('drops a binding with no source', () => {
    expect(only('<p data-dukafy-bind-text="justafield"></p>').dynamicBindings).toBeUndefined()
  })

  // `annotateNodeIds` stamps `uid` so the assistant can target existing nodes.
  // Models echo it back onto NEW elements, where it would publish as raw
  // markup on the storefront. Caught in the first live run against a model.
  it('drops the read-surface uid instead of publishing it', () => {
    const node = only('<section uid="hero2" id="hero" class="p-8">hi</section>')

    const attrs = (node.props.htmlAttributes ?? {}) as Record<string, string>
    expect(attrs.uid).toBeUndefined()
    expect(attrs.id).toBe('hero')
  })

  // ── Module overrides ─────────────────────────────────────────────────────
  //
  // A loop and a component reference have no HTML element of their own, and
  // without a spelling for them the assistant could not build a category page
  // at all — the prompt had to tell it to give up and ask the merchant.

  it('turns a loop attribute into a product loop', () => {
    const node = only('<div data-dukafy-loop="products" class="grid"><article>card</article></div>')

    expect(node.moduleId).toBe('store.relationship-loop')
    expect(node.props.source).toBe('products')
    // Styling and children survive the module swap.
    expect(node.classIds).toEqual(['grid'])
    expect(node.children).toHaveLength(1)
  })

  it('reads loop options', () => {
    const node = only(
      '<div data-dukafy-loop="collections/featured.products" data-dukafy-loop-per-page="8" ' +
        'data-dukafy-loop-order-by="price" data-dukafy-loop-direction="desc"><p>x</p></div>',
    )

    expect(node.props.source).toBe('collections/featured.products')
    expect(node.props.perPage).toBe(8)
    expect(node.props.orderBy).toBe('price')
    expect(node.props.direction).toBe('desc')
  })

  // Reviews are the one top-level source with no slug to name — the whole
  // approved set, in one word. A testimonials wall is the reason it exists.
  it('turns a loop attribute into a reviews loop', () => {
    const node = only('<div data-dukafy-loop="reviews" data-dukafy-loop-per-page="3"><article>card</article></div>')

    expect(node.moduleId).toBe('store.relationship-loop')
    expect(node.props.source).toBe('reviews')
    expect(node.props.perPage).toBe(3)
  })

  it('accepts the relative sources that make nesting work', () => {
    for (const source of ['currentEntry.variants', 'currentEntry.stars', 'cart.items', 'products/canvas-bag.variants']) {
      expect(only(`<div data-dukafy-loop="${source}"><p>x</p></div>`).props.source).toBe(source)
    }
  })

  // An unrecognised source would render an empty loop with no hint why.
  it('leaves the element alone for a source the publisher cannot resolve', () => {
    const node = only('<div data-dukafy-loop="whatever"><p>x</p></div>')

    expect(node.moduleId).toBe('base.container')
  })

  it('turns a component attribute into a component reference', () => {
    const node = only('<div data-dukafy-component="cmp_123"></div>')

    expect(node.moduleId).toBe('base.visual-component-ref')
    expect(node.props.componentId).toBe('cmp_123')
  })

  it('marks a container as a sheet', () => {
    const node = only('<div data-dukafy-overlay="sheet-right" class="w-96">x</div>')

    expect(node.actions?.overlay).toBe('sheet-right')
    expect(node.classIds).toEqual(['w-96'])
  })

  it('carries an overlay open trigger with its target', () => {
    const node = only('<button data-dukafy-action="overlay.open" data-dukafy-action-target="sheet1">Cart</button>')

    expect(node.actions?.click).toEqual({ type: 'overlay.open', target: 'sheet1' })
  })

  // The canonical drawer: an overlay whose contents are a cart region.
  it('accepts an overlay and a cart region on one element', () => {
    const node = only('<div data-dukafy-overlay="sheet-right" data-dukafy-region="cart">x</div>')

    expect(node.actions?.overlay).toBe('sheet-right')
    expect(node.actions?.region).toBe('cart')
  })

  it('leaves ordinary markup untouched', () => {
    const node = only('<div class="mx-auto flex gap-4">hello</div>')

    expect(node.actions).toBeUndefined()
    expect(node.visibleWhen).toBeUndefined()
    expect(node.dynamicBindings).toBeUndefined()
    expect(node.classIds).toEqual(['mx-auto', 'flex', 'gap-4'])
  })

  // The whole point of HTML-in: Tailwind classes survive verbatim, so the model
  // never has to author CSS or invent style rules.
  it('carries Tailwind classes through to classIds alongside overlays', () => {
    const node = only(
      '<button class="rounded-md bg-black px-4 py-2" data-dukafy-action="cart.addItem">Add</button>',
    )

    expect(node.classIds).toEqual(['rounded-md', 'bg-black', 'px-4', 'py-2'])
    expect(node.actions?.click?.type).toBe('cart.addItem')
  })
})
