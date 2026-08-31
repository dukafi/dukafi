/**
 * Noticing that something else wrote to the store.
 *
 * The editor is no longer the only writer. These pin the two ways this could
 * be useless: never firing when an agent edits, or firing constantly on the
 * editor's OWN saves — which would train a merchant to ignore it.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useExternalSiteChanges } from '@site/sync/useExternalSiteChanges'
import { lastSeenSiteSeq, notifyExternalSiteChange, recordSiteSeq, resetSiteSeq } from '@site/sync/siteSyncSeq'
import { armSkipSiteAutosave, consumeSkipSiteAutosave } from '@site/sync/refreshSiteFromServer'

/** The real interval is 5s; these assert behaviour, not wall-clock. */
const TICK = 10

beforeEach(() => { resetSiteSeq() })
afterEach(() => { resetSiteSeq() })

describe('siteSyncSeq', () => {
  it('starts at zero and records what it is told', () => {
    expect(lastSeenSiteSeq()).toBe(0)
    recordSiteSeq(7)
    expect(lastSeenSiteSeq()).toBe(7)
  })

  // Responses can arrive out of order. A late, lower value must not re-arm a
  // notice that has already been dealt with.
  it('never moves backwards', () => {
    recordSiteSeq(7)
    recordSiteSeq(3)
    expect(lastSeenSiteSeq()).toBe(7)
  })

  it('ignores a non-numeric seq rather than poisoning the baseline', () => {
    recordSiteSeq(7)
    recordSiteSeq(Number.NaN)
    expect(lastSeenSiteSeq()).toBe(7)
  })
})

describe('useExternalSiteChanges', () => {
  it('reports a change once the server moves past what this tab saw', async () => {
    recordSiteSeq(4)
    const { result } = renderHook(() =>
      useExternalSiteChanges({ enabled: true, intervalMs: TICK, fetchSeq: async () => 5 }))

    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true), { timeout: TICK * 20 })
  })

  // The editor bumps the seq on every autosave. Reporting that back would make
  // the notice fire constantly and mean nothing.
  it('stays quiet when the server matches what this tab saw', async () => {
    recordSiteSeq(5)
    const { result } = renderHook(() =>
      useExternalSiteChanges({ enabled: true, intervalMs: TICK, fetchSeq: async () => 5 }))

    await new Promise((resolve) => setTimeout(resolve, TICK * 4))
    expect(result.current).toBe(false)
  })

  // Our own save lands between two polls; the baseline moves with it.
  it('does not report our own save that happened mid-poll', async () => {
    recordSiteSeq(5)
    const { result } = renderHook(() =>
      useExternalSiteChanges({ enabled: true, intervalMs: TICK, fetchSeq: async () => 6 }))

    recordSiteSeq(6)

    await new Promise((resolve) => setTimeout(resolve, TICK * 4))
    expect(result.current).toBe(false)
  })

  it('does nothing when disabled', async () => {
    recordSiteSeq(1)
    let calls = 0
    const { result } = renderHook(() =>
      useExternalSiteChanges({ enabled: false, intervalMs: TICK, fetchSeq: async () => { calls += 1; return 99 } }))

    await new Promise((resolve) => setTimeout(resolve, TICK * 4))
    expect(calls).toBe(0)
    expect(result.current).toBe(false)
  })

  // A blip must not surface an error toast every five seconds — that would be
  // worse than the staleness it warns about.
  it('swallows a failed check and keeps polling', async () => {
    recordSiteSeq(1)
    let calls = 0
    const { result } = renderHook(() =>
      useExternalSiteChanges({
        enabled: true,
        intervalMs: TICK,
        fetchSeq: async () => {
          calls += 1
          if (calls === 1) throw new Error('offline')
          return 2
        },
      }))

    await waitFor(() => expect(result.current).toBe(true), { timeout: TICK * 30 })
  })

  it('reports immediately when notifyExternalSiteChange is called', async () => {
    recordSiteSeq(4)
    const { result } = renderHook(() =>
      useExternalSiteChanges({ enabled: true, intervalMs: 60_000, fetchSeq: async () => 4 }))

    expect(result.current).toBe(false)
    act(() => { notifyExternalSiteChange() })
    await waitFor(() => expect(result.current).toBe(true))
  })
})

describe('skip site autosave after a harness refresh', () => {
  it('is a one-shot so the loaded document is not written back', () => {
    expect(consumeSkipSiteAutosave()).toBe(false)
    armSkipSiteAutosave()
    expect(consumeSkipSiteAutosave()).toBe(true)
    expect(consumeSkipSiteAutosave()).toBe(false)
  })
})
