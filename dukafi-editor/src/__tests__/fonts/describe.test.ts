import { describe, expect, it } from 'bun:test'
import { describeFontTokens } from '@core/fonts'
import type { SiteFontsSettings } from '@core/fonts'

const fonts: SiteFontsSettings = {
  items: [
    {
      id: 'inter-id',
      source: 'google',
      family: 'Inter',
      variants: ['400', '700'],
      subsets: ['latin'],
      files: [],
      category: 'sans-serif',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  tokens: [
    {
      id: 'primary-font',
      name: 'Primary',
      variable: 'font-primary',
      familyId: 'inter-id',
      fallback: 'sans-serif',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'system-font',
      name: 'System',
      variable: 'font-system',
      fallback: 'system-ui, sans-serif',
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

describe('describeFontTokens', () => {
  it('returns an empty list when there are no tokens', () => {
    expect(describeFontTokens(null)).toEqual([])
    expect(describeFontTokens({ items: [], tokens: [] })).toEqual([])
  })

  it('describes a token bound to an installed family', () => {
    const [primary] = describeFontTokens(fonts)
    expect(primary.name).toBe('Primary')
    expect(primary.cssVar).toBe('--font-primary')
    expect(primary.ref).toBe('var(--font-primary)')
    expect(primary.family).toBe('Inter')
    expect(primary.stack).toBe('"Inter", sans-serif')
  })

  it('describes a fallback-only system token with no installed family', () => {
    const system = describeFontTokens(fonts)[1]
    expect(system.name).toBe('System')
    expect(system.cssVar).toBe('--font-system')
    expect(system.family).toBe('')
    expect(system.stack).toBe('system-ui, sans-serif')
  })
})
