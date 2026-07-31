/**
 * @font-face import — cssToStyleRules captures faces, buildAssetPlan resolves
 * them into custom font families wired to uploaded media assets.
 *
 * Covers the Super Import path that previously dropped every `@font-face`
 * (see docs/plans/2026-05-30-custom-fonts.md).
 */
import { describe, expect, it } from 'bun:test'
import { cssToStyleRules } from '@core/siteImport/cssToStyleRules'
import { buildAssetPlan, type CssFileResult } from '@core/siteImport/assetPlan'
import type { FileMap } from '@core/siteImport'

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('cssToStyleRules — @font-face capture', () => {
  it('captures family, variant, srcUrls and unicode-range; no longer drops the rule', () => {
    const css = `
      @font-face {
        font-family: "Acme Sans";
        font-weight: 700;
        font-style: italic;
        src: url('fonts/acme-bi.woff2') format('woff2'), url('fonts/acme-bi.woff') format('woff');
        unicode-range: U+0000-00FF;
      }
    `
    const { fontFaces, warnings } = cssToStyleRules(css)
    expect(fontFaces).toHaveLength(1)
    expect(fontFaces[0].family).toBe('Acme Sans')
    expect(fontFaces[0].variant).toBe('700italic')
    expect(fontFaces[0].srcUrls).toEqual(['fonts/acme-bi.woff2', 'fonts/acme-bi.woff'])
    expect(fontFaces[0].unicodeRange).toBe('U+0000-00FF')
    // The @font-face is captured, not dropped — no dropped-at-rule warning.
    expect(warnings.some((w) => w.kind === 'dropped-at-rule')).toBe(false)
  })

  it('maps font-weight keyword + missing style to a canonical variant', () => {
    const css = `@font-face { font-family: Acme; font-weight: bold; src: url('a.ttf'); }`
    const { fontFaces } = cssToStyleRules(css)
    expect(fontFaces[0].variant).toBe('700')
  })

  it('skips a face with no url() src (local-only)', () => {
    const css = `@font-face { font-family: Acme; src: local("Acme"); }`
    const { fontFaces } = cssToStyleRules(css)
    expect(fontFaces).toHaveLength(0)
  })
})

describe('buildAssetPlan — @font-face → custom font family', () => {
  it('resolves the best self-hostable src and groups variants by family', () => {
    const css = `
      @font-face { font-family: "Acme"; font-weight: 400; src: url('fonts/acme.woff2') format('woff2'); }
      @font-face { font-family: "Acme"; font-weight: 700; src: url('fonts/acme-bold.woff') format('woff'); }
    `
    const { fontFaces } = cssToStyleRules(css)
    const fileMap: FileMap = {
      files: {
        'fonts/acme.woff2': { bytes: bytes('woff2-bytes'), mimeType: 'font/woff2' },
        'fonts/acme-bold.woff': { bytes: bytes('woff-bytes'), mimeType: 'font/woff' },
      },
    }
    const cssFileResults: CssFileResult[] = [
      { cssPath: 'style.css', rules: [], assetRefs: [], fontFaces },
    ]
    const { fonts, assets } = buildAssetPlan([], cssFileResults, fileMap)

    expect(fonts).toHaveLength(1)
    expect(fonts[0].family).toBe('Acme')
    expect(fonts[0].files).toHaveLength(2)
    expect(fonts[0].files.map((f) => f.variant).sort()).toEqual(['400', '700'])
    expect(fonts[0].files.find((f) => f.variant === '400')?.format).toBe('woff2')
    // src is still a FileMap key (rewritten to a media URL later by applyAssetRewrites).
    expect(fonts[0].files.find((f) => f.variant === '400')?.src).toBe('fonts/acme.woff2')
    // Both binaries are queued for upload.
    expect(assets.map((a) => a.sourcePath).sort()).toEqual(['fonts/acme-bold.woff', 'fonts/acme.woff2'])
  })

  it('prefers woff2 when a face lists multiple fallback formats', () => {
    const css = `@font-face { font-family: Acme; font-weight: 400; src: url('a.ttf') format('truetype'), url('a.woff2') format('woff2'); }`
    const { fontFaces } = cssToStyleRules(css)
    const fileMap: FileMap = {
      files: {
        'a.ttf': { bytes: bytes('ttf'), mimeType: 'font/ttf' },
        'a.woff2': { bytes: bytes('woff2'), mimeType: 'font/woff2' },
      },
    }
    const { fonts } = buildAssetPlan([], [{ cssPath: 's.css', rules: [], assetRefs: [], fontFaces }], fileMap)
    expect(fonts[0].files[0].format).toBe('woff2')
    expect(fonts[0].files[0].src).toBe('a.woff2')
  })

  it('warns (external-font) and imports nothing when no src is bundled', () => {
    const css = `@font-face { font-family: Acme; font-weight: 400; src: url('https://cdn.example.com/x.woff2') format('woff2'); }`
    const { fontFaces } = cssToStyleRules(css)
    const { fonts, warnings } = buildAssetPlan(
      [],
      [{ cssPath: 's.css', rules: [], assetRefs: [], fontFaces }],
      { files: {} },
    )
    expect(fonts).toHaveLength(0)
    expect(warnings.some((w) => w.kind === 'external-font')).toBe(true)
  })
})
