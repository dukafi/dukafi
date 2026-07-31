import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getPublishVersion,
  bumpPublishVersion,
  withPublishLock,
  resetPublishStateForTests,
} from '../../../server/publish/publishState'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * ISS-038: publish version allocation is a non-atomic read → bake (await) →
 * bump split. Two concurrent publishes both read version N and stamp every
 * <instatic-hole> shell with N+1, then each bump independently to N+2 —
 * leaving the baked shells permanently mis-stamped (served as stale). Running
 * each publish under withPublishLock serializes the read/bake/bump window.
 */
describe('publish version allocation', () => {
  beforeEach(() => resetPublishStateForTests())

  // Simulate a publish: read the version, bake (yield), then bump. Returns the
  // delta between the bumped value and the value read at the start.
  const allocate = async (): Promise<number> => {
    const start = getPublishVersion()
    await delay(20)
    return bumpPublishVersion() - start
  }

  test('interleaves and mis-stamps WITHOUT the lock', async () => {
    const deltas = await Promise.all([allocate(), allocate()])
    // The second publish to bump sees a delta of 2 — it stamped N+1 but the
    // live version is N+2: the race that strands the baked shell.
    expect(deltas).not.toEqual([1, 1])
  })

  test('the publish lock serializes allocation so every bump is exactly +1 (ISS-038)', async () => {
    const deltas = await Promise.all([
      withPublishLock(allocate),
      withPublishLock(allocate),
    ])
    expect(deltas).toEqual([1, 1])
    expect(getPublishVersion()).toBe(2)
  })

  test('the lock advances even when a publish throws', async () => {
    await expect(withPublishLock(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    // A later publish still runs (the chain isn't wedged by the failure).
    const delta = await withPublishLock(allocate)
    expect(delta).toBe(1)
  })
})
