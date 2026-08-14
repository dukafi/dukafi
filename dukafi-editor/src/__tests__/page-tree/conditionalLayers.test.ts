/**
 * parseStyleRule — current contextStyles persistence.
 *
 * The editing-context model stores all per-context style overrides in one
 * `contextStyles` map keyed by context id. Obsolete per-rule fields are not
 * migrated at parse time.
 */

import { describe, it, expect } from 'bun:test'
import { parseStyleRule } from '@core/page-tree'

function baseRaw(extra: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'foo',
    kind: 'class',
    selector: '.foo',
    order: 0,
    styles: { color: 'red' },
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

describe('parseStyleRule — contextStyles', () => {
  it('defaults a rule without contextStyles to an empty map', () => {
    const rule = parseStyleRule(baseRaw())
    expect(rule).not.toBeNull()
    expect(rule!.contextStyles).toEqual({})
  })

  it('round-trips the current contextStyles shape', () => {
    const rule = parseStyleRule(
      baseRaw({ contextStyles: { tablet: { color: 'blue' }, 'media:(orientation: landscape)': { gap: '8px' } } }),
    )
    expect(rule!.contextStyles).toEqual({
      tablet: { color: 'blue' },
      'media:(orientation: landscape)': { gap: '8px' },
    })
  })

  it('ignores obsolete breakpointStyles', () => {
    const rule = parseStyleRule(baseRaw({ breakpointStyles: { tablet: { fontSize: '14px' } } }))
    expect(rule!.contextStyles).toEqual({})
  })

  it('ignores obsolete conditionalLayers', () => {
    const rule = parseStyleRule(
      baseRaw({
        conditionalLayers: [
          { id: 'm1', condition: { kind: 'media', query: '(orientation: landscape)' }, styles: { color: 'blue' }, order: 0 },
          { id: 'c1', condition: { kind: 'container', name: 'sidebar', query: 'min-width: 400px' }, styles: { display: 'grid' }, order: 1 },
          { id: 's1', condition: { kind: 'supports', query: '(display: grid)' }, styles: { gap: '8px' }, order: 2 },
        ],
      }),
    )
    expect(rule!.contextStyles).toEqual({})
  })

  it('drops rules missing current selector metadata', () => {
    expect(parseStyleRule({
      id: 'x',
      name: 'legacy-name',
      styles: { color: 'red' },
      createdAt: 0,
      updatedAt: 0,
    })).toBeNull()
  })
})
