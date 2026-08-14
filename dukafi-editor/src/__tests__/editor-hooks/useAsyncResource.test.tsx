import { describe, it, expect, afterEach } from 'bun:test'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAsyncResource } from '@admin/lib/useAsyncResource'

afterEach(() => {
  cleanup()
})

describe('useAsyncResource', () => {
  it('starts loading, then resolves with data', async () => {
    const { result } = renderHook(() => useAsyncResource(() => Promise.resolve(42), []))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe(42)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an Error message on failure', async () => {
    const { result } = renderHook(() =>
      useAsyncResource(() => Promise.reject(new Error('boom')), []),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.data).toBeNull()
  })

  it('uses the fallback message for a non-Error throw', async () => {
    const { result } = renderHook(() =>
      useAsyncResource(() => Promise.reject('nope'), [], { fallbackError: 'Could not load' }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Could not load')
  })

  it('swallows errors when asked (data and error stay null)', async () => {
    const { result } = renderHook(() =>
      useAsyncResource(() => Promise.reject(new Error('boom')), [], { swallowErrors: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('re-runs the loader on refresh()', async () => {
    let calls = 0
    const { result } = renderHook(() =>
      useAsyncResource(() => {
        calls += 1
        return Promise.resolve(calls)
      }, []),
    )

    await waitFor(() => expect(result.current.data).toBe(1))

    act(() => {
      result.current.refresh()
    })

    await waitFor(() => expect(result.current.data).toBe(2))
    expect(calls).toBe(2)
  })

  it('re-runs the loader when deps change', async () => {
    let id = 1
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useAsyncResource(() => Promise.resolve(key * 10), [key]),
      { initialProps: { key: id } },
    )

    await waitFor(() => expect(result.current.data).toBe(10))

    id = 2
    rerender({ key: id })
    await waitFor(() => expect(result.current.data).toBe(20))
  })

  it('discards a stale response after unmount', async () => {
    let resolve!: (value: number) => void
    const pending = new Promise<number>((r) => {
      resolve = r
    })
    const { result, unmount } = renderHook(() => useAsyncResource(() => pending, []))

    unmount()
    // Resolving after unmount must not throw or update detached state.
    act(() => {
      resolve(99)
    })
    await Promise.resolve()
    expect(result.current.data).toBeNull()
  })
})
