/**
 * Unit tests for the CSS2 parser used by the Google Fonts installer.
 *
 * These cover the comment-attribution rules that decide which `@font-face`
 * block belongs to which subset — the install / estimate logic depends on
 * getting that mapping right (otherwise users either over-download every
 * subset or never see slices the family actually advertises).
 */

import { describe, expect, it } from 'bun:test'
import {
  computePrimarySubset,
  parseCss2Faces,
} from '../../../server/fonts/googleFontsInstaller'

const ROBOTO_CSS = `
/* cyrillic */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/roboto/v51/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/roboto/v51/lat-ext.woff2) format('woff2');
  unicode-range: U+0100-024F;
}
/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/roboto/v51/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`

const NOTO_JP_CSS = `
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/jp.0.woff2) format('woff2');
  unicode-range: U+25EE8;
}
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/jp.1.woff2) format('woff2');
  unicode-range: U+1F235;
}
/* cyrillic */
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* vietnamese */
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/vi.woff2) format('woff2');
  unicode-range: U+1EA0-1EF9;
}
/* latin-ext */
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/lat-ext.woff2) format('woff2');
  unicode-range: U+0100-024F;
}
/* latin */
@font-face {
  font-family: 'Noto Sans JP';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notosansjp/v56/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`

describe('parseCss2Faces — Roboto-style (every subset named)', () => {
  it('attributes each block to the preceding /* subset */ comment', () => {
    const faces = parseCss2Faces(ROBOTO_CSS, '')
    expect(faces.map((f) => f.subset)).toEqual(['cyrillic', 'latin-ext', 'latin'])
  })

  it('round-trips weight, italic, url, and unicode-range', () => {
    const faces = parseCss2Faces(ROBOTO_CSS, '')
    expect(faces[2]).toEqual({
      weight: 400,
      italic: false,
      subset: 'latin',
      url: 'https://fonts.gstatic.com/s/roboto/v51/lat.woff2',
      unicodeRange: 'U+0000-00FF, U+0131',
    })
  })
})

describe('parseCss2Faces — Noto-style (CJK shards before any named subset)', () => {
  it('tags leading unnamed blocks with the primary subset', () => {
    const faces = parseCss2Faces(NOTO_JP_CSS, 'japanese')
    expect(faces.map((f) => f.subset)).toEqual([
      'japanese',
      'japanese',
      'cyrillic',
      'vietnamese',
      'latin-ext',
      'latin',
    ])
  })

  it('switches subsets at the named-comment boundary', () => {
    const faces = parseCss2Faces(NOTO_JP_CSS, 'japanese')
    const lastJp = faces.findLast((f) => f.subset === 'japanese')
    const firstLatin = faces.find((f) => f.subset === 'latin')
    expect(lastJp?.url).toBe('https://fonts.gstatic.com/s/notosansjp/v56/jp.1.woff2')
    expect(firstLatin?.url).toBe('https://fonts.gstatic.com/s/notosansjp/v56/lat.woff2')
  })
})

describe('parseCss2Faces — multi-variant CJK (regression)', () => {
  // Google emits one full pass per variant: primary-subset shards first, then
  // each named subset. The next variant repeats the pattern starting with
  // unnamed primary shards. The parser MUST reset the active subset back to
  // primary at the variant boundary, otherwise the last named subset of
  // variant 1 (e.g. "latin") leaks into the unnamed shards of variant 2.
  const NOTO_KR_TWO_VARIANTS_CSS = `
    @font-face { font-style: normal; font-weight: 200;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/kor.0.weight200.woff2);
      unicode-range: U+f9ca-fa0b; }
    @font-face { font-style: normal; font-weight: 200;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/kor.1.weight200.woff2);
      unicode-range: U+f92f-f980; }
    /* cyrillic */
    @font-face { font-style: normal; font-weight: 200;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/cyr.weight200.woff2); }
    /* latin */
    @font-face { font-style: normal; font-weight: 200;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/lat.weight200.woff2); }
    @font-face { font-style: normal; font-weight: 400;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/kor.0.weight400.woff2);
      unicode-range: U+f9ca-fa0b; }
    @font-face { font-style: normal; font-weight: 400;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/kor.1.weight400.woff2);
      unicode-range: U+f92f-f980; }
    /* cyrillic */
    @font-face { font-style: normal; font-weight: 400;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/cyr.weight400.woff2); }
    /* latin */
    @font-face { font-style: normal; font-weight: 400;
      src: url(https://fonts.gstatic.com/s/notosanskr/v39/lat.weight400.woff2); }
  `

  it('resets to primary subset at the variant boundary', () => {
    const faces = parseCss2Faces(NOTO_KR_TWO_VARIANTS_CSS, 'korean')
    // Group by (subset, weight) to see distribution.
    const counts = new Map<string, number>()
    for (const f of faces) {
      const key = `${f.subset}/${f.weight}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    // Each variant pass: 2 korean shards + 1 cyrillic + 1 latin.
    expect(counts.get('korean/200')).toBe(2)
    expect(counts.get('korean/400')).toBe(2)
    expect(counts.get('cyrillic/200')).toBe(1)
    expect(counts.get('cyrillic/400')).toBe(1)
    expect(counts.get('latin/200')).toBe(1)
    expect(counts.get('latin/400')).toBe(1)
  })

  it('correctly filters multi-variant + single-subset selections', () => {
    const faces = parseCss2Faces(NOTO_KR_TWO_VARIANTS_CSS, 'korean')
    const requestedSubsets = new Set(['latin'])
    const requestedVariants = new Set(['200', '400'])
    const matched = faces.filter((f) => {
      const v = f.italic ? `${f.weight}italic` : String(f.weight)
      return requestedVariants.has(v) && requestedSubsets.has(f.subset)
    })
    // 2 variants × 1 latin slice per variant = 2 files (was 122 before the fix).
    expect(matched).toHaveLength(2)
    expect(matched.map((f) => f.url).sort()).toEqual([
      'https://fonts.gstatic.com/s/notosanskr/v39/lat.weight200.woff2',
      'https://fonts.gstatic.com/s/notosanskr/v39/lat.weight400.woff2',
    ])
  })
})

describe('parseCss2Faces — non-name comments do not change the active subset', () => {
  it('ignores numeric shard markers like /* [0] */', () => {
    const css = `
      /* latin */
      /* [0] */
      @font-face {
        font-family: 'X';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/x/0.woff2) format('woff2');
      }
    `
    const faces = parseCss2Faces(css, '')
    expect(faces).toHaveLength(1)
    expect(faces[0].subset).toBe('latin')
  })
})

describe('parseCss2Faces — security', () => {
  it('skips faces whose src is not on the gstatic CDN', () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Evil';
        font-style: normal;
        font-weight: 400;
        src: url(https://attacker.example/evil.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
    `
    expect(parseCss2Faces(css, '')).toHaveLength(0)
  })
})

describe('computePrimarySubset', () => {
  it('returns the family subset that has no named /* */ comment in the CSS', () => {
    // Roboto names every subset in the CSS, so the primary is empty.
    expect(
      computePrimarySubset(
        ['latin', 'latin-ext', 'cyrillic'],
        ROBOTO_CSS,
      ),
    ).toBe('')
  })

  it('detects the CJK primary subset (japanese for Noto Sans JP)', () => {
    expect(
      computePrimarySubset(
        ['cyrillic', 'japanese', 'latin', 'latin-ext', 'vietnamese'],
        NOTO_JP_CSS,
      ),
    ).toBe('japanese')
  })

  it('ignores non-name comments when collecting named subsets', () => {
    const css = `
      /* [0] */
      /* latin */
      @font-face { font-weight: 400; font-style: normal; src: url(https://fonts.gstatic.com/s/x/0.woff2); }
    `
    expect(computePrimarySubset(['cyrillic', 'latin'], css)).toBe('cyrillic')
  })
})
