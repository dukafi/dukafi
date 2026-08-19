/**
 * NodeAction parsing — the overlay contract between editor and publisher.
 *
 * These parsers are the load path for EVERY document, including hand-authored
 * block JSON. A verb the parser drops is a verb that silently disappears on
 * the next save, so the mirror between this file and
 * `CART_ACTIONS` / `apply_region` in `dukafi/publisher/render_page.rb` has to
 * be tested rather than assumed.
 */

import { describe, expect, it } from 'bun:test'
import { parseNodeActions, type NodeActionType, type NodeRegion } from '@core/page-tree'

describe('parseNodeActions', () => {
  const VERBS: NodeActionType[] = [
    'cart.addItem', 'cart.removeItem', 'cart.setQuantity', 'cart.createOrder',
    'payment.initiate', 'account.register', 'account.login', 'account.logout',
    'overlay.open', 'overlay.close',
    'loop.next', 'loop.previous',
  ]

  it.each(VERBS)('keeps the %s verb', (type) => {
    expect(parseNodeActions({ click: { type } })).toEqual({ click: { type } })
  })

  const REGIONS: NodeRegion[] = ['cart', 'payment', 'form']

  it.each(REGIONS)('keeps the %s region', (region) => {
    expect(parseNodeActions({ region })).toEqual({ region })
  })

  it('carries an auth button and its form region together', () => {
    // The shape a merchant's sign-in box actually produces: the region on the
    // wrapper, the verb on the submit button inside it.
    expect(parseNodeActions({ click: { type: 'account.login' }, region: 'form' }))
      .toEqual({ click: { type: 'account.login' }, region: 'form' })
  })

  it('drops a verb the publisher has no renderer for', () => {
    // Tolerant, not fatal — an action from a newer Dukafi must not take down
    // the whole document.
    expect(parseNodeActions({ click: { type: 'account.deleteEverything' } })).toBeUndefined()
  })

  // A sheet is a flag on a container, like `region` — its contents stay
  // ordinary nodes, so a loop or a cart region works inside one.
  it.each(['modal', 'sheet-left', 'sheet-right', 'sheet-bottom'] as const)(
    'keeps the %s overlay', (overlay) => {
      expect(parseNodeActions({ overlay })).toEqual({ overlay })
    },
  )

  it('carries the overlay target on an open trigger', () => {
    expect(parseNodeActions({ click: { type: 'overlay.open', target: 'sheet1' } }))
      .toEqual({ click: { type: 'overlay.open', target: 'sheet1' } })
  })

  // A cart drawer is both at once.
  it('carries an overlay and a cart region together', () => {
    expect(parseNodeActions({ overlay: 'sheet-right', region: 'cart' }))
      .toEqual({ overlay: 'sheet-right', region: 'cart' })
  })

  it('drops an unknown overlay variant', () => {
    expect(parseNodeActions({ overlay: 'lightbox' })).toBeUndefined()
  })

  it('drops an unknown region', () => {
    expect(parseNodeActions({ region: 'checkout' })).toBeUndefined()
  })

  it('keeps pagination chrome with no click verb', () => {
    expect(parseNodeActions({ pagination: '' })).toEqual({ pagination: '' })
    expect(parseNodeActions({ pagination: 'featured' })).toEqual({ pagination: 'featured' })
    expect(parseNodeActions({ pagination: true })).toEqual({ pagination: '' })
  })

  it('maps loop.prev to loop.previous', () => {
    expect(parseNodeActions({ click: { type: 'loop.prev' } }))
      .toEqual({ click: { type: 'loop.previous' } })
  })
})
