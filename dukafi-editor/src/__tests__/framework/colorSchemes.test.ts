import { describe, expect, it } from 'bun:test'
import type { FrameworkColorToken } from '@core/framework-schema'
import { generateClassCSS } from '@core/publisher'
import {
  buildDefaultColorSchemes,
  deriveSchemeFromColor,
  generateColorSchemeClasses,
  isSchemeAssignmentClass,
  listSchemePaletteOptions,
  pickSchemeOnFillSlug,
  pickTokenSlug,
  resolveColorSchemes,
  schemeClassName,
} from '@core/framework'

function token(slug: string, lightValue = '#111111'): FrameworkColorToken {
  return {
    id: slug,
    category: 'Brand',
    slug,
    lightValue,
    darkValue: '',
    darkModeEnabled: false,
    generateUtilities: { text: true, background: true, border: true, fill: false },
    generateTransparent: false,
    generateShades: { enabled: false, count: 4 },
    generateTints: { enabled: false, count: 4 },
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

const palette = [
  token('primary', '#2563eb'),
  token('bg-body', '#f7f7f5'),
  token('bg-surface', '#eeeeee'),
  token('text-title', '#111111'),
  token('text-body', '#3d3d3d'),
  token('border-primary', '#1f1f1f'),
  token('dark', '#111111'),
  token('light', '#ffffff'),
]

describe('color schemes', () => {
  it('maps roles onto existing palette slugs', () => {
    expect(pickTokenSlug(palette, 'bg-body', 'light')).toBe('bg-body')
    expect(pickTokenSlug(palette, 'missing', 'primary')).toBe('primary')
  })

  it('seeds four Relume-style schemes from the palette', () => {
    const schemes = buildDefaultColorSchemes(palette)
    expect(schemes.map((row) => row.slug)).toEqual(['scheme-1', 'scheme-2', 'scheme-3', 'scheme-4'])
    expect(schemes[0]!.roles.background).toBe('bg-body')
    expect(schemes[0]!.roles.heading).toBe('text-title')
    expect(schemes[0]!.roles.accent).toBe('primary')
    expect(schemes[2]!.roles.background).toBe('dark')
    expect(schemes[3]!.roles.background).toBe('primary')
  })

  it('emits one scope class per scheme and shared role utilities', () => {
    const schemes = buildDefaultColorSchemes(palette)
    const classes = generateColorSchemeClasses({ schemes }, { tokens: palette })
    expect(classes['framework:scheme:scope:scheme-1']?.name).toBe('scheme-1')
    expect(classes['framework:scheme:scope:scheme-1']?.styles['--scheme-background']).toBe('var(--bg-body)')
    expect(classes['framework:scheme:role:bg-scheme-background']?.styles.backgroundColor).toBe('var(--scheme-background)')
    expect(classes['framework:scheme:role:text-scheme-heading']?.styles.color).toBe('var(--scheme-heading)')
    expect(schemeClassName('Scheme 2')).toBe('scheme-2')
    expect(isSchemeAssignmentClass(classes['framework:scheme:scope:scheme-1'])).toBe(true)
    expect(isSchemeAssignmentClass(classes['framework:scheme:role:bg-scheme-background'])).toBe(true)
    const css = generateClassCSS(classes, [])
    expect(css).toContain('--scheme-background: var(--bg-body)')
    expect(css).toContain('.scheme-1')
    expect(css).toContain('[data-scheme="scheme-1"]')
    expect(css).toContain('background-color: var(--scheme-background)')
    expect(classes['framework:scheme:role:text-scheme-on-accent']?.styles.color).toBe('var(--scheme-on-accent)')
    expect(classes['framework:scheme:scope:scheme-1']?.styles['--scheme-on-accent']).toBe('var(--bg-body)')
    expect(classes['framework:scheme:scope:scheme-4']?.styles['--scheme-on-accent']).toBe('var(--light)')
  })

  it('picks heading or background so text holds on a non-canvas fill', () => {
    const schemes = buildDefaultColorSchemes(palette)
    const canvas = schemes[0]!.roles
    const brand = schemes[3]!.roles
    expect(pickSchemeOnFillSlug(canvas.accent, canvas, palette)).toBe('bg-body')
    expect(pickSchemeOnFillSlug(brand.accent, brand, palette)).toBe('light')
  })

  it('lists brand colors and their generated shades for the role picker', () => {
    const primary: FrameworkColorToken = {
      ...token('primary'),
      category: 'Brand',
      generateShades: { enabled: true, count: 2 },
      generateTints: { enabled: true, count: 2 },
      generateTransparent: false,
    }
    const options = listSchemePaletteOptions([primary])
    expect(options.some((row) => row.slug === 'primary' && row.label === 'Primary')).toBe(true)
    expect(options.some((row) => row.slug === 'primary-d-1' && row.label === 'Primary - d-1')).toBe(true)
    expect(options.some((row) => row.slug === 'primary-l-1' && row.label === 'Primary - l-1')).toBe(true)
    expect(options.every((row) => row.group === 'Brand')).toBe(true)
  })

  it('derives six roles from a seed color', () => {
    const derived = deriveSchemeFromColor('#2563eb', 'scheme-1')
    expect(derived).not.toBeNull()
    expect(derived!.roles.accent).toBe('scheme-1-accent')
    expect(derived!.tokens).toHaveLength(6)
    expect(derived!.tokens.map((row) => row.role)).toEqual([
      'background',
      'secondary',
      'heading',
      'body',
      'accent',
      'border',
    ])
    const accent = derived!.tokens.find((row) => row.role === 'accent')!.lightValue
    const background = derived!.tokens.find((row) => row.role === 'background')!.lightValue
    expect(accent).toMatch(/^hsla\(/i)
    expect(background).toMatch(/^hsla\(/i)
    expect(background).not.toBe(accent)
  })

  it('uses stored schemes when present', () => {
    const stored = resolveColorSchemes({
      schemes: [{
        id: 'ink',
        slug: 'ink',
        name: 'Ink',
        order: 0,
        roles: {
          background: 'dark',
          secondary: 'bg-body',
          heading: 'light',
          body: 'light',
          accent: 'primary',
          border: 'light',
        },
      }],
    }, palette)
    expect(stored).toHaveLength(1)
    expect(stored[0]!.slug).toBe('ink')
  })
})
