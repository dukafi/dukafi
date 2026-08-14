import { describe, expect, it } from 'bun:test'
import { validateSite } from '@core/persistence/validate'

function baseSite(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'default',
    name: 'Site',
    pages: [
      {
        id: 'p1',
        title: 'Home',
        slug: 'home',
        rootNodeId: 'r1',
        nodes: { r1: { id: 'r1', moduleId: 'base.text', props: {}, children: [], breakpointOverrides: {} } },
      },
    ],
    breakpoints: [{ id: 'desktop', label: 'Desktop', width: 1280, icon: 'monitor' }],
    files: [],
    visualComponents: [],
    styleRules: {},
    createdAt: 0,
    updatedAt: 0,
    settings: { colorTokens: {}, shortcuts: {} },
    ...extra,
  }
}

describe('validateSite — fonts', () => {
  it('preserves a well-formed fonts library', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [
            {
              id: 'f1',
              source: 'google',
              family: 'Inter',
              variants: ['400'],
              subsets: ['latin'],
              files: [
                { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
              ],
              category: 'Sans Serif',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
      },
    }))

    expect(site.settings.fonts?.items.length).toBe(1)
    expect(site.settings.fonts?.items[0].family).toBe('Inter')
    expect(site.settings.fonts?.items[0].files[0].path).toBe('/uploads/fonts/inter/400-latin.woff2')
  })

  it('drops files served from outside /uploads/fonts/', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [
            {
              id: 'f1',
              source: 'google',
              family: 'Inter',
              variants: ['400'],
              subsets: ['latin'],
              files: [
                // Safe — kept
                { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
                // Unsafe — dropped
                { variant: '400', subset: 'latin', path: 'https://attacker/evil.woff2', format: 'woff2' },
                // Path traversal — dropped
                { variant: '400', subset: 'latin', path: '/uploads/fonts/../etc/passwd', format: 'woff2' },
              ],
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        },
      },
    }))

    expect(site.settings.fonts?.items[0].files.length).toBe(1)
    expect(site.settings.fonts?.items[0].files[0].path).toBe('/uploads/fonts/inter/400-latin.woff2')
  })

  it('drops font entries with no usable id / family', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [
            // Missing family — dropped
            { id: 'f0', source: 'google', variants: ['400'], subsets: ['latin'], files: [] },
            // Valid
            {
              id: 'f1',
              source: 'google',
              family: 'Inter',
              variants: [],
              subsets: [],
              files: [],
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        },
      },
    }))

    expect(site.settings.fonts?.items.length).toBe(1)
    expect(site.settings.fonts?.items[0].family).toBe('Inter')
  })

  it('returns undefined fonts when settings.fonts is absent', () => {
    const site = validateSite(baseSite())
    expect(site.settings.fonts).toBeUndefined()
  })

  it('round-trips per-slice unicodeRange and drops corrupted ranges', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [
            {
              id: 'f1',
              source: 'google',
              family: 'Roboto',
              variants: ['400'],
              subsets: ['latin'],
              files: [
                // Slice 0 — valid CSS unicode-range, kept verbatim.
                {
                  variant: '400',
                  subset: 'latin',
                  path: '/uploads/fonts/roboto/400-latin-0.woff2',
                  format: 'woff2',
                  unicodeRange: 'U+0000-00FF, U+0131',
                },
                // Slice 1 — no unicode-range (legacy / custom upload), still kept.
                {
                  variant: '400',
                  subset: 'latin',
                  path: '/uploads/fonts/roboto/400-latin-1.woff2',
                  format: 'woff2',
                },
                // Slice 2 — injection attempt, must be dropped entirely by checkFontFile.
                {
                  variant: '400',
                  subset: 'latin',
                  path: '/uploads/fonts/roboto/400-latin-2.woff2',
                  format: 'woff2',
                  unicodeRange: 'U+0061; } </style><script>alert(1)</script>',
                },
              ],
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
      },
    }))

    const files = site.settings.fonts?.items[0].files ?? []
    expect(files.length).toBe(2)
    expect(files[0].unicodeRange).toBe('U+0000-00FF, U+0131')
    expect(files[1].unicodeRange).toBeUndefined()
  })

  it('preserves valid font tokens and normalizes editable variable names', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [
            {
              id: 'f1',
              source: 'google',
              family: 'Inter',
              variants: ['400'],
              subsets: ['latin'],
              files: [
                { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
              ],
              category: 'Sans Serif',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          tokens: [
            {
              id: 'token-primary',
              name: 'Primary',
              variable: '--Font Primary',
              familyId: 'f1',
              fallback: 'sans-serif',
              order: 0,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
      },
    }))

    expect(site.settings.fonts?.tokens).toEqual([
      {
        id: 'token-primary',
        name: 'Primary',
        variable: 'font-primary',
        familyId: 'f1',
        fallback: 'sans-serif',
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ])
  })

  it('drops malformed and duplicate font tokens', () => {
    const site = validateSite(baseSite({
      settings: {
        colorTokens: {},
        shortcuts: {},
        fonts: {
          items: [],
          tokens: [
            {
              id: 'token-primary',
              name: 'Primary',
              variable: 'font-primary',
              fallback: 'sans-serif',
              order: 0,
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: 'token-duplicate',
              name: 'Duplicate',
              variable: '--font-primary',
              fallback: 'serif',
              order: 1,
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: '',
              name: 'Broken',
              variable: 'font-broken',
              fallback: 'sans-serif',
            },
          ],
        },
      },
    }))

    expect(site.settings.fonts?.tokens).toEqual([
      {
        id: 'token-primary',
        name: 'Primary',
        variable: 'font-primary',
        fallback: 'sans-serif',
        order: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ])
  })
})
