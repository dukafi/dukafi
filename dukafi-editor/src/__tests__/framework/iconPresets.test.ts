import { describe, expect, it } from 'bun:test'
import {
  buildDefaultSpacingSettings,
  buildDefaultTypographySettings,
  generateFrameworkRootCss,
  generateIconPresetVariables,
  resolveIconPresets,
} from '@core/framework'

describe('icon presets', () => {
  it('defaults to outlined scheme-accent icons in a subtle filled box', () => {
    expect(resolveIconPresets(undefined)).toEqual({
      color: 'accent',
      style: 'outlined',
      weight: '4',
      fill: 'outline',
      treatment: 'fill',
      fillIntensity: 'subtle',
      padding: '4',
      radius: '2',
      radiusLinked: true,
    })
  })

  it('emits box and glyph variables, linking radius to the site default', () => {
    const vars = generateIconPresetVariables(undefined)
    const byName = Object.fromEntries(vars.map((row) => [row.name, row.value]))
    expect(byName['--icon-color']).toBe('var(--scheme-accent, currentColor)')
    expect(byName['--icon-stroke-width']).toBe('1.5')
    expect(byName['--icon-fill']).toBe('none')
    expect(byName['--icon-box-radius']).toBe('var(--radius)')
    expect(byName['--icon-box-bg']).toContain('color-mix')
  })

  it('unlinks radius and paints a filled glyph when asked', () => {
    const vars = generateIconPresetVariables({
      color: 'heading',
      style: 'filled',
      weight: '7',
      fill: 'fill',
      treatment: 'outline',
      fillIntensity: 'strong',
      padding: '6',
      radius: '7',
      radiusLinked: false,
    })
    const byName = Object.fromEntries(vars.map((row) => [row.name, row.value]))
    expect(byName['--icon-color']).toBe('var(--scheme-heading, currentColor)')
    expect(byName['--icon-fill']).toBe('currentColor')
    expect(byName['--icon-box-radius']).toBe('9999px')
    expect(byName['--icon-box-border']).toBe('1px solid var(--icon-color)')
    expect(byName['--icon-box-padding']).toBe('1rem')
  })

  it('merges icon rules into root CSS when typography exists', () => {
    const css = generateFrameworkRootCss({ typography: buildDefaultTypographySettings() })
    expect(css).toContain('--icon-color: var(--scheme-accent, currentColor)')
    expect(css).toContain(':where(svg)')
    expect(css).toContain('stroke-width: var(--icon-stroke-width)')
  })

  it('emits icons with spacing too', () => {
    const css = generateFrameworkRootCss({ spacing: buildDefaultSpacingSettings() })
    expect(css).toContain(':where(svg)')
  })
})
