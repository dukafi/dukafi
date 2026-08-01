/**
 * Unit tests for the generic bounded-parallelism helper. Extracted from the
 * Google Fonts installer (its only consumer caps concurrent woff2 downloads),
 * the helper itself is domain-agnostic — these tests pin its contract:
 * order preservation, the concurrency cap, empty input, and first-error reject.
 */

import { describe, expect, it } from 'bun:test'
import { mapWithConcurrency } from '../../../server/util/mapWithConcurrency'

describe('mapWithConcurrency — bounded parallelism', () => {
  it('processes every item exactly once and preserves order', async () => {
    const items = [10, 20, 30, 40, 50]
    const results = await mapWithConcurrency(items, 2, async (n) => n * 2)
    expect(results).toEqual([20, 40, 60, 80, 100])
  })

  it('passes the item index to the worker', async () => {
    const items = ['a', 'b', 'c']
    const results = await mapWithConcurrency(items, 2, async (item, index) => `${index}:${item}`)
    expect(results).toEqual(['0:a', '1:b', '2:c'])
  })

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    await mapWithConcurrency(items, 4, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // Yield twice so the runner can pick up another task.
      await Promise.resolve()
      await Promise.resolve()
      inFlight -= 1
    })
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })

  it('handles an empty list without spawning workers', async () => {
    const results = await mapWithConcurrency([] as number[], 4, async (n) => n + 1)
    expect(results).toEqual([])
  })

  it('rejects on the first worker error', async () => {
    const items = [1, 2, 3, 4]
    const error = new Error('boom')
    await expect(
      mapWithConcurrency(items, 2, async (n) => {
        if (n === 3) throw error
        return n
      }),
    ).rejects.toBe(error)
  })
})
