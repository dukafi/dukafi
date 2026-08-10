/**
 * `visibleWhen` parsing.
 *
 * The load-bearing decision here is what happens to a condition we can't
 * understand: it is DROPPED, leaving the node visible. A node that vanishes
 * because its condition failed to parse looks exactly like a node someone
 * deleted, with nothing in the UI to debug. Showing it is recoverable;
 * hiding it silently is not.
 *
 * Mirrors `node_visible?` in `dukafy/publisher/render_page.rb`.
 */

import { describe, expect, it } from 'bun:test'
import { parseNodeVisibility, parsePageNode } from '@core/page-tree'

describe('parseNodeVisibility', () => {
  it('accepts a well-formed condition', () => {
    expect(parseNodeVisibility({ source: 'currentEntry', field: 'inCart', operator: 'isTrue' }))
      .toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isTrue' })
  })

  it('keeps a value only for operators that compare against one', () => {
    expect(parseNodeVisibility({ source: 'cart', field: 'count', operator: 'greaterThan', value: '2' }))
      .toEqual({ source: 'cart', field: 'count', operator: 'greaterThan', value: '2' })

    // `isTrue` takes no operand — carrying one would imply it were consulted.
    expect(parseNodeVisibility({ source: 'cart', field: 'count', operator: 'isTrue', value: '2' }))
      .toEqual({ source: 'cart', field: 'count', operator: 'isTrue' })
  })

  it('drops conditions it cannot understand rather than guessing', () => {
    expect(parseNodeVisibility({ source: 'nope', field: 'inCart', operator: 'isTrue' })).toBeUndefined()
    expect(parseNodeVisibility({ source: 'cart', field: '', operator: 'isTrue' })).toBeUndefined()
    expect(parseNodeVisibility({ source: 'cart', field: 'count', operator: 'sortOf' })).toBeUndefined()
    expect(parseNodeVisibility(null)).toBeUndefined()
    expect(parseNodeVisibility('isTrue')).toBeUndefined()
  })
})

describe('parsePageNode with visibleWhen', () => {
  const base = {
    id: 'n1',
    moduleId: 'base.text',
    children: [],
    props: {},
    breakpointOverrides: {},
    classIds: [],
  }

  it('round-trips a valid condition', () => {
    const node = parsePageNode(
      { ...base, visibleWhen: { source: 'currentEntry', field: 'inCart', operator: 'isFalse' } },
      'nodes.n1',
    )
    expect(node.visibleWhen).toEqual({ source: 'currentEntry', field: 'inCart', operator: 'isFalse' })
  })

  it('leaves the node visible and intact when the condition is junk', () => {
    const node = parsePageNode({ ...base, visibleWhen: { source: 'nope' } }, 'nodes.n1')

    expect(node.visibleWhen).toBeUndefined()
    expect(node.id).toBe('n1')
    expect(node.moduleId).toBe('base.text')
  })

  it('omits the key entirely when absent, so documents do not grow noise', () => {
    expect('visibleWhen' in parsePageNode(base, 'nodes.n1')).toBe(false)
  })
})
