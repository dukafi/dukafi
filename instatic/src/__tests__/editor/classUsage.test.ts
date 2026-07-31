/**
 * classUsage — Recent / Frequent suggestion ranking + persistence.
 *
 * The ClassPicker dropdown surfaces "Recent" and "Frequent" sections when its
 * input is empty (Spec UX #1349). This file pins:
 *   - Recency wins ties; Frequent excludes anything already in Recent
 *   - Available-class filtering: deleted/hidden classes drop out
 *   - localStorage persistence round-trips with no decoding surprises
 *   - Corrupt localStorage payloads fall back to an empty table
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  CLASS_USAGE_RECENT_LIMIT,
  CLASS_USAGE_FREQUENT_LIMIT,
  CLASS_USAGE_STORAGE_KEY,
  __resetClassUsageForTests,
  forgetClassUsage,
  readClassUsage,
  recordClassUsage,
  selectRecentAndFrequent,
} from '@site/preferences/classUsage'

beforeEach(() => {
  __resetClassUsageForTests()
})

describe('recordClassUsage', () => {
  it('starts new entries at count=1 and stamps lastUsedAt', () => {
    const before = Date.now()
    recordClassUsage('cls-a')
    const after = Date.now()

    const usage = readClassUsage()
    expect(usage['cls-a']?.count).toBe(1)
    expect(usage['cls-a']?.lastUsedAt).toBeGreaterThanOrEqual(before)
    expect(usage['cls-a']?.lastUsedAt).toBeLessThanOrEqual(after)
  })

  it('increments count on subsequent usage', () => {
    recordClassUsage('cls-a')
    recordClassUsage('cls-a')
    recordClassUsage('cls-a')

    expect(readClassUsage()['cls-a']?.count).toBe(3)
  })

  it('ignores empty classId (defensive guard)', () => {
    recordClassUsage('')
    expect(readClassUsage()).toEqual({})
  })
})

describe('readClassUsage', () => {
  it('falls back to {} when localStorage holds non-JSON garbage', () => {
    globalThis.localStorage?.setItem(CLASS_USAGE_STORAGE_KEY, '{not valid json')
    expect(readClassUsage()).toEqual({})
  })

  it('falls back to {} when localStorage holds the wrong shape', () => {
    globalThis.localStorage?.setItem(
      CLASS_USAGE_STORAGE_KEY,
      JSON.stringify({ 'cls-a': 'not-an-object' }),
    )
    expect(readClassUsage()).toEqual({})
  })
})

describe('forgetClassUsage', () => {
  it('drops only the named class IDs from the usage map', () => {
    recordClassUsage('cls-a')
    recordClassUsage('cls-b')
    recordClassUsage('cls-c')

    forgetClassUsage(['cls-b'])

    const usage = readClassUsage()
    expect(Object.keys(usage).sort()).toEqual(['cls-a', 'cls-c'])
  })

  it('is a no-op when none of the IDs are present', () => {
    recordClassUsage('cls-a')
    forgetClassUsage(['nope'])
    expect(readClassUsage()['cls-a']?.count).toBe(1)
  })
})

describe('selectRecentAndFrequent', () => {
  it('orders Recent by lastUsedAt desc and excludes them from Frequent', () => {
    const usage = {
      'cls-old-popular': { lastUsedAt: 1, count: 100 },
      'cls-recent-rare': { lastUsedAt: 1000, count: 1 },
      'cls-mid': { lastUsedAt: 500, count: 10 },
    }
    const { recent, frequent } = selectRecentAndFrequent(
      usage,
      ['cls-old-popular', 'cls-recent-rare', 'cls-mid'],
      { recent: 1, frequent: 5 },
    )

    expect(recent).toEqual(['cls-recent-rare'])
    // The recent entry is excluded; remaining sort by count desc.
    expect(frequent).toEqual(['cls-old-popular', 'cls-mid'])
  })

  it('respects per-call limits', () => {
    const usage: Record<string, { lastUsedAt: number; count: number }> = {}
    const ids: string[] = []
    for (let i = 0; i < 20; i++) {
      const id = `cls-${i.toString().padStart(2, '0')}`
      ids.push(id)
      usage[id] = { lastUsedAt: 1000 - i, count: 20 - i }
    }
    const { recent, frequent } = selectRecentAndFrequent(usage, ids, {
      recent: 3,
      frequent: 4,
    })

    expect(recent).toHaveLength(3)
    expect(frequent).toHaveLength(4)
    // No overlap: each class appears in at most one section.
    expect(new Set([...recent, ...frequent]).size).toBe(7)
  })

  it('uses the documented default limits when called without overrides', () => {
    const usage: Record<string, { lastUsedAt: number; count: number }> = {}
    const ids: string[] = []
    const total = CLASS_USAGE_RECENT_LIMIT + CLASS_USAGE_FREQUENT_LIMIT + 5
    for (let i = 0; i < total; i++) {
      const id = `cls-${i.toString().padStart(2, '0')}`
      ids.push(id)
      usage[id] = { lastUsedAt: 1000 - i, count: 100 - i }
    }
    const { recent, frequent } = selectRecentAndFrequent(usage, ids)

    expect(recent).toHaveLength(CLASS_USAGE_RECENT_LIMIT)
    expect(frequent).toHaveLength(CLASS_USAGE_FREQUENT_LIMIT)
  })

  it('skips classes that aren\'t in the available list', () => {
    const usage = {
      'cls-deleted': { lastUsedAt: 1000, count: 50 },
      'cls-still-here': { lastUsedAt: 500, count: 1 },
    }
    const { recent, frequent } = selectRecentAndFrequent(
      usage,
      ['cls-still-here'],
    )

    expect(recent).toEqual(['cls-still-here'])
    expect(frequent).toEqual([])
  })

  it('skips classes with zero count even when they appear in usage', () => {
    const usage = {
      'cls-stale': { lastUsedAt: 999, count: 0 },
      'cls-real': { lastUsedAt: 100, count: 1 },
    }
    const { recent, frequent } = selectRecentAndFrequent(
      usage,
      ['cls-stale', 'cls-real'],
    )

    expect(recent).toEqual(['cls-real'])
    expect(frequent).toEqual([])
  })

  it('returns empty arrays when the usage table is empty', () => {
    expect(selectRecentAndFrequent({}, ['cls-a', 'cls-b'])).toEqual({
      recent: [],
      frequent: [],
    })
  })
})
