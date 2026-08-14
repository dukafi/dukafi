import { describe, expect, it } from 'bun:test'
import {
  buildDefaultSpacingSettings,
  buildDefaultTypographySettings,
  describeFrameworkTokens,
} from '@core/framework'
import type { FrameworkColorSettings } from '@core/framework-schema'

const colors: FrameworkColorSettings = {
  tokens: [
    {
      id: 'primary-token',
      category: 'Brand',
      slug: 'primary',
      lightValue: 'hsla(238, 100%, 62%, 1)',
      darkValue: 'hsla(238, 100%, 42%, 1)',
      darkModeEnabled: true,
      generateUtilities: { text: true, background: true, border: false, fill: false },
      generateTransparent: true,
      generateShades: { enabled: true, count: 2 },
      generateTints: { enabled: true, count: 2 },
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

describe('describeFrameworkTokens', () => {
  it('returns an empty digest for null/undefined settings', () => {
    expect(describeFrameworkTokens(null)).toEqual({ colors: [], typography: [], spacing: [] })
    expect(describeFrameworkTokens(undefined)).toEqual({ colors: [], typography: [], spacing: [] })
  })

  it('pairs each color token with its var, ref, value, dark value, and utility classes', () => {
    const { colors: described } = describeFrameworkTokens({ colors })
    expect(described).toHaveLength(1)
    const primary = described[0]

    expect(primary.slug).toBe('primary')
    expect(primary.category).toBe('Brand')
    expect(primary.cssVar).toBe('--primary')
    expect(primary.ref).toBe('var(--primary)')
    expect(primary.value).toContain('hsla(238')
    expect(primary.darkValue).toBeDefined()
    // text + background enabled, border + fill disabled.
    expect(primary.utilityClasses.sort()).toEqual(['bg-primary', 'text-primary'])
  })

  it('describes shade / tint variants with their own var + utility class', () => {
    const { colors: described } = describeFrameworkTokens({ colors })
    const primary = described[0]
    const shade1 = primary.variants.find((v) => v.variant === 'd-1')
    expect(shade1?.cssVar).toBe('--primary-d-1')
    expect(shade1?.ref).toBe('var(--primary-d-1)')
    expect(shade1?.utilityClasses.sort()).toEqual(['bg-primary-d-1', 'text-primary-d-1'])

    const tint2 = primary.variants.find((v) => v.variant === 'l-2')
    expect(tint2?.cssVar).toBe('--primary-l-2')
  })

  it('describes the typography scale group, pairing each step var with its class', () => {
    const { typography } = describeFrameworkTokens({ typography: buildDefaultTypographySettings() })
    expect(typography).toHaveLength(1)
    const group = typography[0]
    expect(group.family).toBe('typography')
    expect(group.namingConvention).toBe('text')

    const stepM = group.steps.find((s) => s.step === 'm')
    expect(stepM?.cssVar).toBe('--text-m')
    expect(stepM?.ref).toBe('var(--text-m)')
    expect(stepM?.utilityClasses).toContain('text-m')
    expect(stepM?.value.length).toBeGreaterThan(0)
  })

  it('describes the spacing scale group with its padding/margin/gap classes', () => {
    const { spacing } = describeFrameworkTokens({ spacing: buildDefaultSpacingSettings() })
    expect(spacing).toHaveLength(1)
    const group = spacing[0]
    expect(group.family).toBe('spacing')
    expect(group.namingConvention).toBe('space')

    const stepM = group.steps.find((s) => s.step === 'm')
    expect(stepM?.cssVar).toBe('--space-m')
    expect(stepM?.utilityClasses).toEqual(expect.arrayContaining(['padding-m', 'margin-m', 'gap-m']))
  })
})
