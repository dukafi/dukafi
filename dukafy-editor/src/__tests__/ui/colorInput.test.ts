import { describe, expect, it } from 'bun:test'
import { getColorInputValue, getColorSwatchValue } from '@ui/components/ColorInput/ColorInput.utils'

describe('ColorInput utilities', () => {
  it('keeps native color input values restricted to six-digit hex', () => {
    expect(getColorInputValue('#4455ff')).toBe('#4455ff')
    expect(getColorInputValue('hsla(238, 100%, 62%, 1)')).toBe('#3d44ff')
    expect(getColorInputValue('rgb(255, 0, 128)')).toBe('#ff0080')
  })

  it('allows safe CSS color values for swatch previews', () => {
    expect(getColorSwatchValue('hsla(238, 100%, 62%, 1)')).toBe('hsla(238, 100%, 62%, 1)')
    expect(getColorSwatchValue('var(--primary)')).toBe('var(--primary)')
    expect(getColorSwatchValue('red; color: blue')).toBe('#000000')
  })
})
