import { describe, expect, it } from 'bun:test'
import {
  generateButtonCss,
  generateButtonPresetVariables,
  resolveButtonPresets,
} from '@core/framework'

describe('button presets', () => {
  it('provides the Relume-style defaults without requiring stored settings', () => {
    expect(resolveButtonPresets()).toEqual({
      primaryColor: 'accent', secondaryColor: 'secondary', linkColor: 'accent',
      padding: '4', radius: '4', radiusLinked: true, fontVariable: 'inherit',
      fontSize: '4', fontWeight: '5', casing: 'normal', letterSpacing: '4',
    })
  })

  it('emits shared type, spacing, radius, and scheme-role variables', () => {
    const vars = Object.fromEntries(generateButtonPresetVariables({
      ...resolveButtonPresets(), radiusLinked: false, radius: '7',
      fontVariable: 'font-primary', casing: 'uppercase',
    }).map((row) => [row.name, row.value]))
    expect(vars['--button-primary-color']).toBe('var(--scheme-accent, currentColor)')
    expect(vars['--button-radius']).toBe('9999px')
    expect(vars['--button-font-family']).toBe('var(--font-primary, inherit)')
    expect(vars['--button-text-transform']).toBe('uppercase')
  })

  it('rejects unsafe persisted font-variable interpolation', () => {
    expect(resolveButtonPresets({ ...resolveButtonPresets(), fontVariable: 'x);color:red' }).fontVariable).toBe('inherit')
  })

  it('uses zero-specificity defaults so an authored class wins', () => {
    const css = generateButtonCss(true)
    expect(css).toContain(':where(.dukafi-button)')
    expect(css).toContain(':where(.dukafi-button.button-secondary)')
    expect(css).toContain(':where(.dukafi-button.button-link)')
    expect(css).not.toContain('!important')
  })
})
