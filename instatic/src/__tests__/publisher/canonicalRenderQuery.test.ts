import { describe, test, expect } from 'bun:test'
import { canonicalRenderQuery } from '../../../server/publish/loopPrefetch'

/**
 * ISS-032: the Layer B render LRU was keyed on the raw query string, so an
 * unauthenticated attacker could mint unbounded distinct cache keys
 * (`/about?x=1`, `/about?x=2`, …) that all render identical HTML — thrashing
 * the shared LRU and forcing a full render+sanitise per request. The cache key
 * (and the Layer A fast-path eligibility) must derive from a canonical query
 * that keeps ONLY the loop pagination params the renderer actually consumes.
 */
describe('canonicalRenderQuery', () => {
  const q = (s: string) => canonicalRenderQuery(new URLSearchParams(s))

  test('drops arbitrary junk params to empty', () => {
    expect(q('x=1')).toBe('')
    expect(q('utm_source=foo&gclid=bar')).toBe('')
    expect(q('')).toBe('')
  })

  test('keeps loop pagination params', () => {
    expect(q('loop_abc_page=2')).toBe('?loop_abc_page=2')
  })

  test('strips junk but keeps loop params', () => {
    expect(q('utm=foo&loop_abc_page=3&x=9')).toBe('?loop_abc_page=3')
  })

  test('canonicalises ordering so equivalent queries collapse to one key', () => {
    expect(q('loop_b_page=1&loop_a_page=2')).toBe(q('loop_a_page=2&loop_b_page=1'))
  })
})
