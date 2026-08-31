import { describe, expect, it } from 'bun:test'
import { buildDefaultTypographySettings, generateTypeStyleCss, resolveTypeStyles } from '@core/framework'

describe('type styles', () => {
  it('resolves H1–H7 and P even when nothing is stored', () => {
    const styles = resolveTypeStyles(buildDefaultTypographySettings())
    expect(styles.map((row) => row.tag)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'p'])
    expect(styles[0]!.fontSize).toContain('--text-4xl')
    expect(styles[7]!.fontWeight).toBe('400')
  })

  it('emits zero-specificity tag defaults so classes can override', () => {
    const css = generateTypeStyleCss(buildDefaultTypographySettings())
    expect(css).toContain(':where(h1)')
    expect(css).toContain(':where(h7)')
    expect(css).toContain(':where(p)')
    expect(css).toContain('font-size: var(--text-4xl, 3rem)')
    expect(css).not.toMatch(/\{\s*\}/)
  })

  it('uses stored overrides and skips a disabled module', () => {
    const settings = buildDefaultTypographySettings()
    settings.styles = [{
      tag: 'h1',
      fontFamily: 'var(--font-primary)',
      fontSize: '5rem',
      fontWeight: '800',
      letterSpacing: '-0.04em',
      lineHeight: '1.05',
      textTransform: 'uppercase',
      maxWidth: '20ch',
    }]
    const css = generateTypeStyleCss(settings)
    expect(css).toContain('font-size: 5rem')
    expect(css).not.toContain('max-width')
    expect(generateTypeStyleCss({ ...settings, isDisabled: true })).toBe('')
  })
})
