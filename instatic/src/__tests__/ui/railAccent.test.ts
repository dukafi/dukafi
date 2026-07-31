import { describe, expect, it } from 'bun:test'
import { assignRailAccents, railAccent, RAIL_ACCENTS } from '@ui/railAccent'

describe('railAccent', () => {
  it('uses the full identity, not just the first letter', () => {
    const accents = assignRailAccents(
      ['site', 'selectors', 'spacing'],
      (id) => `site:${id}`,
    )

    expect(new Set(accents).size).toBe(3)
  })

  it('keeps a visible rail group diverse until the palette is exhausted', () => {
    const items = ['layers', 'site', 'selectors', 'colors', 'typography', 'spacing', 'media', 'dependencies']
    const accents = assignRailAccents(items, (id) => `site:${id}`)

    expect(new Set(accents).size).toBe(items.length)
  })

  it('respects explicit accents and avoids them for automatic neighbors', () => {
    const accents = assignRailAccents(
      ['plugin-a', 'plugin-b', 'plugin-c'],
      (id) => id,
      (id) => id === 'plugin-a' ? 'mint' : null,
    )

    expect(accents[0]).toBe('mint')
    expect(accents.slice(1)).not.toContain('mint')
  })

  it('falls back to the palette for empty identities', () => {
    expect(RAIL_ACCENTS).toContain(railAccent(''))
  })
})
