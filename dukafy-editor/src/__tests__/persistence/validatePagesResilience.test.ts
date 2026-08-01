import { describe, it, expect } from 'bun:test'
import { validatePages, SiteValidationError } from '@core/persistence/validate'
import { makePage, makeNode, makeSite } from '../fixtures'

const shell = makeSite()

/**
 * ISS-017: one malformed page row used to hard-abort the whole site load,
 * bricking the editor. Load must quarantine the bad page (mirroring VC
 * tolerance); the strict write path must still reject it.
 */
describe('validatePages — malformed page tolerance (ISS-017)', () => {
  const good = makePage({
    id: 'good',
    slug: 'good',
    rootNodeId: 'r',
    nodes: { r: makeNode({ id: 'r', moduleId: 'base.body' }) },
  })
  // rootNodeId points at a node id that isn't in `nodes` → invalid tree.
  const broken = {
    id: 'bad',
    slug: 'bad',
    title: 'Bad',
    rootNodeId: 'missing',
    nodes: { r: makeNode({ id: 'r', moduleId: 'base.body' }) },
  }

  it('throws in strict mode (write/save path)', () => {
    expect(() => validatePages(shell, [good, broken], [])).toThrow(SiteValidationError)
  })

  it('quarantines the malformed page and loads the rest in tolerant mode', () => {
    const pages = validatePages(shell, [good, broken], [], { tolerant: true })
    expect(pages.map((p) => p.id)).toEqual(['good'])
  })
})

/**
 * ISS-016: a VC deduped/de-cycled by the loader must NOT cause its page refs
 * (and the authored slot content underneath) to be stripped — that loss then
 * became permanent on the next save. Only refs to VCs genuinely absent from
 * storage may be stripped.
 */
describe('validatePages — repaired-away VC refs preserved (ISS-016)', () => {
  function pageWithRef(componentId: string) {
    return makePage({
      id: 'p1',
      slug: 'p1',
      rootNodeId: 'root',
      nodes: {
        root: makeNode({ id: 'root', moduleId: 'base.body', children: ['ref'] }),
        ref: makeNode({
          id: 'ref',
          moduleId: 'base.visual-component-ref',
          props: { componentId },
          children: ['slot'],
        }),
        slot: makeNode({ id: 'slot', moduleId: 'base.slot-instance', children: ['txt'] }),
        txt: makeNode({ id: 'txt', moduleId: 'base.text' }),
      },
    })
  }

  it('keeps the ref + slot content when the VC exists in storage but was repaired away', () => {
    const pages = validatePages(shell, [pageWithRef('vc-dup')], [], {
      storedVcIds: new Set(['vc-dup']),
    })
    expect(pages[0]!.nodes['ref']).toBeDefined()
    expect(pages[0]!.nodes['slot']).toBeDefined()
    expect(pages[0]!.nodes['txt']).toBeDefined()
  })

  it('still strips refs to VCs genuinely absent from storage', () => {
    const pages = validatePages(shell, [pageWithRef('ghost')], [], {
      storedVcIds: new Set<string>(),
    })
    expect(pages[0]!.nodes['ref']).toBeUndefined()
    expect(pages[0]!.nodes['txt']).toBeUndefined()
  })
})
