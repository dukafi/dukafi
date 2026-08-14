import { describe, expect, it } from 'bun:test'
import {
  fontFaceCount,
  generateFontTokenVariablesCss,
  generateFontsCss,
  generateSiteFontsCss,
} from '@core/fonts'
import type { FontEntry, SiteFontsSettings } from '@core/fonts'

const inter: FontEntry = {
  id: 'f1',
  source: 'google',
  family: 'Inter',
  variants: ['400', '700italic'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
    { variant: '700italic', subset: 'latin', path: '/uploads/fonts/inter/700italic-latin.woff2', format: 'woff2' },
  ],
  category: 'Sans Serif',
  createdAt: 0,
  updatedAt: 0,
}

const malicious: FontEntry = {
  // Attempts to escape the @font-face block via embedded `</style>`,
  // breakouts in family name, and an off-brand path. The generator must
  // strip / refuse all of these.
  id: 'f2',
  source: 'google',
  family: 'Bad"Family</style>',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/bad/400-latin.woff2', format: 'woff2' },
    // Path outside /uploads/fonts/ — must NOT be emitted.
    { variant: '400', subset: 'latin', path: 'https://attacker.example/evil.woff2', format: 'woff2' as const },
  ],
  category: 'Sans Serif',
  createdAt: 0,
  updatedAt: 0,
}

describe('generateSiteFontsCss', () => {
  it('emits one @font-face block per (variant, subset) tuple', () => {
    const css = generateSiteFontsCss({ items: [inter] })
    expect(css.match(/@font-face/g)?.length ?? 0).toBe(2)
    expect(css).toContain('font-family: "Inter";')
    expect(css).toContain('font-weight: 400;')
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('font-style: italic;')
    expect(css).toContain('url("/uploads/fonts/inter/400-latin.woff2")')
  })

  it('skips files served from outside /uploads/fonts/', () => {
    const css = generateSiteFontsCss({ items: [malicious] })
    expect(css).not.toContain('attacker.example')
  })

  it('strips quotes / angle brackets from the family name in CSS', () => {
    const css = generateSiteFontsCss({ items: [malicious] })
    // No raw quote breakout.
    expect(css).not.toContain('Bad"Family')
    // Closing-style sequence stripped.
    expect(css).not.toContain('</style>')
  })

  it('returns empty string for missing / empty input', () => {
    expect(generateSiteFontsCss(null)).toBe('')
    expect(generateSiteFontsCss(undefined)).toBe('')
    expect(generateSiteFontsCss({ items: [] })).toBe('')
  })

  it('emits one @font-face per slice with unicode-range when present', () => {
    // Mirrors what Google's CSS2 endpoint returns for a single (variant, subset):
    // multiple `@font-face` blocks each pinned to a different unicode-range.
    const sliced: FontEntry = {
      ...inter,
      family: 'Roboto',
      files: [
        {
          variant: '400',
          subset: 'latin',
          path: '/uploads/fonts/roboto/400-latin-0.woff2',
          format: 'woff2',
          unicodeRange: 'U+0000-00FF, U+0131',
        },
        {
          variant: '400',
          subset: 'latin',
          path: '/uploads/fonts/roboto/400-latin-1.woff2',
          format: 'woff2',
          unicodeRange: 'U+0100-024F',
        },
      ],
    }
    const css = generateSiteFontsCss({ items: [sliced] })
    expect(css.match(/@font-face/g)?.length ?? 0).toBe(2)
    expect(css).toContain('unicode-range: U+0000-00FF, U+0131;')
    expect(css).toContain('unicode-range: U+0100-024F;')
    expect(css).toContain('url("/uploads/fonts/roboto/400-latin-0.woff2")')
    expect(css).toContain('url("/uploads/fonts/roboto/400-latin-1.woff2")')
  })

  it('omits unicode-range when the file has none (legacy single-slice install)', () => {
    const css = generateSiteFontsCss({ items: [inter] })
    expect(css).not.toContain('unicode-range')
  })

  it('refuses to emit a CSS-injected unicode-range', () => {
    const tainted: FontEntry = {
      ...inter,
      files: [
        {
          variant: '400',
          subset: 'latin',
          path: '/uploads/fonts/inter/400-latin-0.woff2',
          format: 'woff2',
          unicodeRange: 'U+0061; } </style><script>alert(1)</script>',
        },
      ],
    }
    const css = generateSiteFontsCss({ items: [tainted] })
    // The unsafe range is dropped; the surrounding @font-face still emits.
    expect(css).toContain('@font-face')
    expect(css).not.toContain('unicode-range')
    expect(css).not.toContain('</style>')
    expect(css).not.toContain('<script>')
  })
})

describe('generateFontTokenVariablesCss', () => {
  it('emits editable font token variables from fonts.tokens', () => {
    const css = generateFontTokenVariablesCss({
      items: [inter],
      tokens: [
        {
          id: 'token-primary',
          name: 'Primary',
          variable: 'font-primary',
          familyId: inter.id,
          fallback: 'sans-serif',
          order: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    })
    expect(css).toContain('--font-primary: "Inter", sans-serif;')
  })

  it('emits fallback-only tokens when no installed family is assigned', () => {
    const settings: SiteFontsSettings = {
      items: [inter],
      tokens: [
        {
          id: 'token-system',
          name: 'System',
          variable: 'font-system',
          fallback: 'system-ui, sans-serif',
          order: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }
    expect(generateFontTokenVariablesCss(settings)).toContain('--font-system: system-ui, sans-serif;')
  })

  it('does not emit installed-family variables', () => {
    const css = generateFontTokenVariablesCss({ items: [inter] })
    expect(css).toBe('')
  })
})

describe('generateFontsCss', () => {
  it('combines font token variables + @font-face rules', () => {
    const css = generateFontsCss({
      items: [inter],
      tokens: [
        {
          id: 'token-primary',
          name: 'Primary',
          variable: 'font-primary',
          familyId: inter.id,
          fallback: 'sans-serif',
          order: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    })
    expect(css).toContain('--font-primary')
    expect(css).not.toContain('--font-inter')
    expect(css).toContain('@font-face')
  })

  it('returns empty string when nothing is installed', () => {
    expect(generateFontsCss(null)).toBe('')
  })
})

describe('fontFaceCount', () => {
  it('counts woff2 files only', () => {
    expect(fontFaceCount(inter)).toBe(2)
  })
})
