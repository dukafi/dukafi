/**
 * Tests for the auto-resolve hook that keeps `siteRuntime.dependencyLock`
 * in lockstep with `packageJson.dependencies`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAutoResolveDependencies } from '@site/hooks/useAutoResolveDependencies'
import { useEditorStore } from '@site/store/store'
import { normalizeSiteRuntimeConfig } from '@core/site-runtime'
import { makeSite } from '../fixtures'

const originalFetch = globalThis.fetch
const CONFETTI_IMPORTMAP = {
  lockHash: 'test-lock',
  imports: {
    'canvas-confetti': '/_instatic/runtime/cache/test-lock/canvas-confetti/dist/confetti.module.mjs',
    'canvas-confetti/': '/_instatic/runtime/cache/test-lock/canvas-confetti/',
  },
}

afterEach(() => {
  globalThis.fetch = originalFetch
  cleanup()
})

function seedStore(packageDeps: Record<string, string>) {
  const packageJson = { dependencies: packageDeps, devDependencies: {} }
  const runtime = normalizeSiteRuntimeConfig(undefined)
  useEditorStore.setState({
    site: makeSite({ packageJson, runtime }),
    packageJson,
    siteRuntime: runtime,
    dependencyResolveStatus: 'idle',
    dependencyResolveLockedCount: 0,
    dependencyResolveError: null,
  } as Parameters<typeof useEditorStore.setState>[0])
}

describe('useAutoResolveDependencies', () => {
  beforeEach(() => seedStore({ 'canvas-confetti': '^1.9.3' }))

  async function flushResolveQueue(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
  }

  it('kicks off a background resolve when the lock is out of sync', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(JSON.stringify({
        dependencyLock: {
          version: 1,
          packages: {
            'canvas-confetti': {
              name: 'canvas-confetti',
              requested: '^1.9.3',
              version: '1.9.3',
              resolvedAt: 1,
            },
          },
          updatedAt: 1,
        },
        packageImportmap: CONFETTI_IMPORTMAP,
      }), { status: 200 })
    }) as typeof fetch

    renderHook(() => useAutoResolveDependencies({ debounceMs: 0 }))

    await waitFor(() => {
      expect(useEditorStore.getState().siteRuntime.dependencyLock.packages['canvas-confetti']?.version).toBe('1.9.3')
    }, { timeout: 2000 })
    expect(calls).toBe(1)
    expect(useEditorStore.getState().dependencyResolveStatus).toBe('resolved')
  })

  it('is a no-op when the lock is already in-sync', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(JSON.stringify({ dependencyLock: { version: 1, packages: {}, updatedAt: 0 } }), { status: 200 })
    }) as typeof fetch

    const runtime = normalizeSiteRuntimeConfig({
      dependencyLock: {
        version: 1,
        packages: {
          'canvas-confetti': {
            name: 'canvas-confetti',
            requested: '^1.9.3',
            version: '1.9.4',
            resolvedAt: 1,
          },
        },
        updatedAt: 1,
      },
      // The hook also fires when the lock has packages but no importmap
      // (legacy state needs a re-resolve to populate it). Seed both
      // alongside the lock so "in-sync + importmap populated" exercises
      // the actual no-op path.
      packageImportmap: {
        lockHash: 'in-sync-hash',
        imports: {
          'canvas-confetti': '/_instatic/runtime/cache/in-sync-hash/canvas-confetti/dist/confetti.module.mjs',
          'canvas-confetti/': '/_instatic/runtime/cache/in-sync-hash/canvas-confetti/',
        },
      },
    })
    useEditorStore.setState({
      siteRuntime: runtime,
      site: { ...useEditorStore.getState().site!, runtime },
    } as Parameters<typeof useEditorStore.setState>[0])

    renderHook(() => useAutoResolveDependencies({ debounceMs: 0 }))

    // Wait one tick: with debounceMs: 0, a mistaken resolve would fire now.
    await flushResolveQueue()
    expect(calls).toBe(0)
  })

  it('debounces a burst of dependency changes into one resolve', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return new Response(JSON.stringify({
        dependencyLock: {
          version: 1,
          packages: {
            'canvas-confetti': {
              name: 'canvas-confetti',
              requested: '^1.9.3',
              version: '1.9.3',
              resolvedAt: 1,
            },
            three: {
              name: 'three',
              requested: '^0.169.0',
              version: '0.169.0',
              resolvedAt: 1,
            },
            motion: {
              name: 'motion',
              requested: '*',
              version: '12.0.0',
              resolvedAt: 1,
            },
          },
          updatedAt: 1,
        },
        packageImportmap: {
          lockHash: 'test-lock-burst',
          imports: {
            'canvas-confetti': '/_instatic/runtime/cache/test-lock-burst/canvas-confetti/dist/confetti.module.mjs',
            'canvas-confetti/': '/_instatic/runtime/cache/test-lock-burst/canvas-confetti/',
            three: '/_instatic/runtime/cache/test-lock-burst/three/build/three.module.js',
            'three/': '/_instatic/runtime/cache/test-lock-burst/three/',
            motion: '/_instatic/runtime/cache/test-lock-burst/motion/dist/index.mjs',
            'motion/': '/_instatic/runtime/cache/test-lock-burst/motion/',
          },
        },
      }), { status: 200 })
    }) as typeof fetch

    renderHook(() => useAutoResolveDependencies({ debounceMs: 0 }))

    // Two rapid edits — should debounce to one fetch.
    act(() => {
      useEditorStore.getState().setDependency('three', '^0.169.0', false)
    })
    act(() => {
      useEditorStore.getState().setDependency('motion', '*', false)
    })

    await waitFor(() => {
      expect(useEditorStore.getState().dependencyResolveStatus).toBe('resolved')
    }, { timeout: 2000 })
    expect(calls).toBe(1)
  })

  it('surfaces resolution errors on the slice without throwing', async () => {
    globalThis.fetch = (async () =>
      new Response('upstream blew up', { status: 502 })) as typeof fetch

    const { unmount } = renderHook(() => useAutoResolveDependencies({ debounceMs: 0 }))

    let observedError: string | null = null
    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.dependencyResolveStatus).toBe('error')
      expect(state.dependencyResolveError).toBeTruthy()
      observedError = state.dependencyResolveError
    }, { timeout: 2000 })
    unmount()
    expect(observedError).toBeTruthy()
  })
})
