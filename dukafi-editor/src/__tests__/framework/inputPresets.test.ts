import { describe, expect, it } from 'bun:test'
import { generateInputCss, generateInputPresetVariables, resolveInputPresets } from '@core/framework'

describe('input presets', () => {
  it('provides defaults without stored settings', () => {
    expect(resolveInputPresets()).toEqual({
      backgroundColor: 'background', textColor: 'body', borderColor: 'border', focusColor: 'accent',
      padding: '4', radius: '4', radiusLinked: true, borderWidth: '2',
      fontVariable: 'inherit', fontSize: '4', fontWeight: '2',
    })
  })

  it('emits scheme, spacing, stroke, and typography variables', () => {
    const vars = Object.fromEntries(generateInputPresetVariables({
      ...resolveInputPresets(), radiusLinked: false, radius: '7', borderWidth: '4', fontVariable: 'font-primary',
    }).map((row) => [row.name, row.value]))
    expect(vars['--input-background']).toBe('var(--scheme-background, currentColor)')
    expect(vars['--input-radius']).toBe('9999px')
    expect(vars['--input-border-width']).toBe('2px')
    expect(vars['--input-font-family']).toBe('var(--font-primary, inherit)')
  })

  it('rejects unsafe font variables and emits overridable rules', () => {
    expect(resolveInputPresets({ ...resolveInputPresets(), fontVariable: 'x);color:red' }).fontVariable).toBe('inherit')
    const css = generateInputCss(true)
    expect(css).toContain(':where(.dukafi-input)')
    expect(css).toContain(':focus-visible')
    expect(css).not.toContain('!important')
  })
})
