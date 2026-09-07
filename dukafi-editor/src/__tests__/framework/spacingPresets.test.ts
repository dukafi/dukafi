import { describe, expect, it } from 'bun:test'
import {
  buildDefaultSpacingSettings,
  buildDefaultTypographySettings,
  generateFrameworkRootCss,
  generateSpacingPresetVariables,
  resolveSpacingPresets,
} from '@core/framework'

describe('spacing presets', () => {
  it('defaults to the quiet-recipe layout (wide / regular / L / M)', () => {
    const presets = resolveSpacingPresets(buildDefaultSpacingSettings())
    expect(presets).toEqual({
      containerWidth: 'wide',
      cardPadding: 'regular',
      vertical: 'l',
      horizontal: 'm',
      radius: 'md',
    })
  })

  it('emits named container sizes plus the selected alias', () => {
    const vars = generateSpacingPresetVariables(buildDefaultSpacingSettings())
    const byName = Object.fromEntries(vars.map((row) => [row.name, row.value]))
    expect(byName['--container-narrow']).toBe('48rem')
    expect(byName['--container-regular']).toBe('64rem')
    expect(byName['--container-wide']).toBe('72rem')
    expect(byName['--container-width']).toBe('var(--container-wide)')
    expect(byName['--card-padding']).toBe('1.5rem')
    expect(byName['--space-vertical']).toBe('5rem')
    expect(byName['--space-horizontal']).toBe('1.5rem')
    expect(byName['--radius']).toBe('var(--radius-md)')
    expect(byName['--radius-button']).toBe('var(--radius)')
    expect(byName['--radius-md']).toBe('0.5rem')
  })

  it('honours stored steps and skips a disabled module', () => {
    const settings = buildDefaultSpacingSettings()
    settings.presets = {
      containerWidth: 'narrow',
      cardPadding: 'tight',
      vertical: 'xs',
      horizontal: 'xl',
      radius: 'full',
    }
    const vars = generateSpacingPresetVariables(settings)
    const byName = Object.fromEntries(vars.map((row) => [row.name, row.value]))
    expect(byName['--container-width']).toBe('var(--container-narrow)')
    expect(byName['--card-padding']).toBe('1rem')
    expect(byName['--space-vertical']).toBe('2rem')
    expect(byName['--space-horizontal']).toBe('2.5rem')
    expect(byName['--radius']).toBe('var(--radius-full)')
    expect(generateSpacingPresetVariables({ ...settings, isDisabled: true })).toEqual([])
  })

  it('merges preset variables into the shared :root block', () => {
    const css = generateFrameworkRootCss({ spacing: buildDefaultSpacingSettings() })
    const baseRootBlocks = css.match(/^:root \{/gm) ?? []
    expect(baseRootBlocks).toHaveLength(1)
    expect(css).toContain('--container-width: var(--container-wide)')
    expect(css).toContain(':where(article, div)')
    expect(css).toContain('border-radius: var(--radius-card)')
  })

  it('emits layout defaults when typography exists but spacing does not', () => {
    const css = generateFrameworkRootCss({ typography: buildDefaultTypographySettings() })
    expect(css).toContain('--container-width: var(--container-wide)')
    expect(css).toContain('--card-padding: 1.5rem')
    expect(css).toContain('--space-vertical: 5rem')
    expect(css).toContain('--space-horizontal: 1.5rem')
    expect(css).toContain('--radius: var(--radius-md)')
    expect(css).toContain(':where(button')
    expect(css).toContain(':where(img, video)')
    expect(css).toContain(':where(article, div)')
    expect(css).toContain('border-radius: var(--radius-card)')
  })
})
