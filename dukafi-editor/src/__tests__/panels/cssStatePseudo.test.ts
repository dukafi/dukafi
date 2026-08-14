import { describe, expect, it } from 'bun:test'
import { selectorStatePseudo } from '@site/cssStatePseudo'

describe('selectorStatePseudo', () => {
  it('returns the state pseudo carried by a selector', () => {
    expect(selectorStatePseudo('.btn:hover')).toBe(':hover')
    expect(selectorStatePseudo('.toggle:checked')).toBe(':checked')
    expect(selectorStatePseudo('.menu:focus-within .item')).toBe(':focus-within')
    expect(selectorStatePseudo('.card:hover::after')).toBe(':hover')
  })

  it('finds the state in any comma-separated list entry', () => {
    expect(selectorStatePseudo('.x .btn, .y:hover')).toBe(':hover')
  })

  it('returns null for non-state selectors', () => {
    expect(selectorStatePseudo('.btn')).toBeNull()
    expect(selectorStatePseudo('*')).toBeNull()
    // Structural / attribute-condition pseudos are not interaction states.
    expect(selectorStatePseudo('.row:first-child')).toBeNull()
    expect(selectorStatePseudo('.field:required')).toBeNull()
    expect(selectorStatePseudo('.a:not(.b)')).toBeNull()
  })
})
