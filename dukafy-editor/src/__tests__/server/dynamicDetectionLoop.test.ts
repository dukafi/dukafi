import { describe, it, expect } from 'bun:test'
import { findDynamicNodeIds } from '../../core/publisher/dynamicDetection'
import { makePage, makeSite, makeRegistry, makeModule } from '../publisher/helpers'

/**
 * ISS-021: a request-dependent node inside a STATIC loop body must promote the
 * LOOP to a single <instatic-hole>, not the inner child. Otherwise the static
 * loop renders the child's hole once per iteration — N duplicate holes with the
 * same id, all resolving to the same context-less fragment.
 */
const reg = makeRegistry({
  'base.body': makeModule('base.body'),
  'base.container': makeModule('base.container'),
  'base.loop': makeModule('base.loop'),
  'base.text': makeModule('base.text'),
})

describe('findDynamicNodeIds — static loop body promotion (ISS-021)', () => {
  it('promotes the static loop and suppresses the inner request-dependent child', () => {
    const page = makePage({
      root: { moduleId: 'base.body', children: ['loop'] },
      // No sourceId → the loop source is static.
      loop: { moduleId: 'base.loop', props: {}, children: ['card'] },
      card: {
        moduleId: 'base.text',
        props: { text: '' },
        dynamicBindings: { text: { source: 'route', field: 'query.q' } },
      },
    })
    const ids = findDynamicNodeIds(page, makeSite(), reg)
    expect(ids.has('loop')).toBe(true)
    expect(ids.has('card')).toBe(false)
  })

  it('suppresses a request-dependent node nested deeper in the static loop body', () => {
    const page = makePage({
      root: { moduleId: 'base.body', children: ['loop'] },
      loop: { moduleId: 'base.loop', props: {}, children: ['box'] },
      box: { moduleId: 'base.container', children: ['card'] },
      card: {
        moduleId: 'base.text',
        props: { text: '' },
        dynamicBindings: { text: { source: 'route', field: 'query.q' } },
      },
    })
    const ids = findDynamicNodeIds(page, makeSite(), reg)
    expect(ids.has('loop')).toBe(true)
    expect(ids.has('card')).toBe(false)
    expect(ids.has('box')).toBe(false)
  })

  it('leaves a fully-static loop alone', () => {
    const page = makePage({
      root: { moduleId: 'base.body', children: ['loop'] },
      loop: { moduleId: 'base.loop', props: {}, children: ['card'] },
      card: { moduleId: 'base.text', props: { text: 'static' } },
    })
    const ids = findDynamicNodeIds(page, makeSite(), reg)
    expect(ids.size).toBe(0)
  })

  it('still flags a request-dependent node that is NOT inside a loop', () => {
    const page = makePage({
      root: { moduleId: 'base.body', children: ['card'] },
      card: {
        moduleId: 'base.text',
        props: { text: '' },
        dynamicBindings: { text: { source: 'route', field: 'query.q' } },
      },
    })
    const ids = findDynamicNodeIds(page, makeSite(), reg)
    expect(ids.has('card')).toBe(true)
  })
})
