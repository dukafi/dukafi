/**
 * ClassPicker ranking — exact > prefix > word-boundary > substring.
 *
 * Pins the autocomplete behaviour the UX brief locks in (Spec UX #1349):
 * typing "text" must surface the class literally named "text" before any
 * `text-*` utility, regardless of registry insertion order.
 */

import { describe, it, expect } from 'bun:test'
import {
  rankBySuggestionScore,
  scoreClassNameMatch,
} from '@site/panels/PropertiesPanel/classPickerRanking'

describe('scoreClassNameMatch', () => {
  it('grades exact matches highest', () => {
    expect(scoreClassNameMatch('text', 'text')).toBe(4)
  })
  it('grades prefix matches second', () => {
    expect(scoreClassNameMatch('text-bg-body-5', 'text')).toBe(3)
  })
  it('grades word-boundary matches third', () => {
    expect(scoreClassNameMatch('text-bg-body-5', 'body')).toBe(2)
    expect(scoreClassNameMatch('text-bg-body-5', 'bg')).toBe(2)
  })
  it('grades anywhere-substring matches fourth', () => {
    // "od" only appears mid-token in "body" — no separator before it.
    expect(scoreClassNameMatch('text-bg-body-5', 'od')).toBe(1)
  })
  it('returns 0 for non-matches', () => {
    expect(scoreClassNameMatch('text-bg-body-5', 'nope')).toBe(0)
  })
  it('is case-insensitive on the name side', () => {
    expect(scoreClassNameMatch('Text-BG-Body', 'text')).toBe(3)
  })
  it('returns 0 for an empty query', () => {
    expect(scoreClassNameMatch('text', '')).toBe(0)
  })
})

describe('rankBySuggestionScore', () => {
  function names(items: Array<{ name: string }>) {
    return items.map((c) => c.name)
  }

  it('puts exact match first, then prefix matches by length, then alphabetical', () => {
    const items = [
      { name: 'text-bg-body-5' },
      { name: 'text-bg-body-10' },
      { name: 'text' },
      { name: 'text-1' },
      { name: 'unrelated' },
    ]
    expect(names(rankBySuggestionScore(items, 'text'))).toEqual([
      'text',
      'text-1',
      'text-bg-body-5',
      'text-bg-body-10',
    ])
  })

  it('prefers prefix over word-boundary, and word-boundary over substring', () => {
    const items = [
      { name: 'banana' }, // substring of "ana"
      { name: 'foo-ana' }, // word-boundary on "ana"
      { name: 'analytics' }, // prefix on "ana"
      { name: 'ana' }, // exact on "ana"
    ]
    expect(names(rankBySuggestionScore(items, 'ana'))).toEqual([
      'ana',
      'analytics',
      'foo-ana',
      'banana',
    ])
  })

  it('strips zero-score items', () => {
    const items = [{ name: 'foo' }, { name: 'bar' }, { name: 'baz' }]
    expect(names(rankBySuggestionScore(items, 'q'))).toEqual([])
  })

  it('returns an empty array for an empty query (no implicit ordering)', () => {
    const items = [{ name: 'foo' }, { name: 'bar' }]
    expect(rankBySuggestionScore(items, '')).toEqual([])
  })
})
