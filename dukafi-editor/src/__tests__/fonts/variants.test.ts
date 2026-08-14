import { describe, expect, it } from 'bun:test'
import {
  compareVariants,
  formatVariant,
  parseVariant,
  variantsToCss2Axis,
} from '@core/fonts'

describe('parseVariant', () => {
  it('parses upright weights', () => {
    expect(parseVariant('400')).toEqual({ weight: 400, italic: false })
    expect(parseVariant('700')).toEqual({ weight: 700, italic: false })
  })

  it('parses italic weights', () => {
    expect(parseVariant('400italic')).toEqual({ weight: 400, italic: true })
  })

  it('returns null for unrecognised tags', () => {
    expect(parseVariant('regular')).toBeNull()
    expect(parseVariant('')).toBeNull()
    expect(parseVariant('400i')).toBeNull() // pre-normalised Google form, not canonical
  })
})

describe('formatVariant', () => {
  it('round-trips through parseVariant', () => {
    for (const tag of ['100', '300italic', '700', '900italic']) {
      const parsed = parseVariant(tag)
      expect(parsed).not.toBeNull()
      expect(formatVariant(parsed!)).toBe(tag)
    }
  })
})

describe('compareVariants', () => {
  it('sorts by weight ascending, italic after upright at same weight', () => {
    const sorted = ['700', '400italic', '400', '700italic'].sort(compareVariants)
    expect(sorted).toEqual(['400', '400italic', '700', '700italic'])
  })

  it('alphabetises unrecognised tags at the end', () => {
    const sorted = ['400', 'foo', 'bar'].sort(compareVariants)
    expect(sorted).toEqual(['400', 'bar', 'foo'])
  })
})

describe('variantsToCss2Axis', () => {
  it('emits a Google-Fonts CSS2 ital,wght@... axis tuple sorted by ital then weight', () => {
    expect(variantsToCss2Axis(['700italic', '400'])).toBe('ital,wght@0,400;1,700')
  })

  it('returns null for empty / unparseable input', () => {
    expect(variantsToCss2Axis([])).toBeNull()
    expect(variantsToCss2Axis(['regular'])).toBeNull()
  })
})
