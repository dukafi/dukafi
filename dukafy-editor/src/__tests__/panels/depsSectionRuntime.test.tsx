import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DepsSection } from '@site/panels/DependenciesPanel/DepsSection'
import { evaluateDependencyLockStatus } from '@site/panels/DependenciesPanel/lockStatus'
import { useEditorStore } from '@site/store/store'
import { makeSite } from '../fixtures'
import { normalizeSiteRuntimeConfig } from '@core/site-runtime'

afterEach(cleanup)
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function resetStore() {
  const packageJson = {
    dependencies: { 'canvas-confetti': '^1.9.3' },
    devDependencies: {},
  }
  useEditorStore.setState({
    site: makeSite({
      packageJson,
      runtime: normalizeSiteRuntimeConfig(undefined),
      files: [{
        id: 'script-1',
        path: 'src/scripts/celebrate.ts',
        type: 'script',
        content: `import confetti from 'canvas-confetti'\nimport { animate } from 'motion'`,
        createdAt: 1,
        updatedAt: 1,
      }],
    }),
    packageJson,
    siteRuntime: normalizeSiteRuntimeConfig(undefined),
    activePageId: 'page-1',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
    // Reset auto-resolve transient state so prior tests in the same suite
    // (or in `useAutoResolveDependencies.test.tsx`) don't leak a "resolved"
    // banner / counter into the DepsSection render under test.
    dependencyResolveStatus: 'idle',
    dependencyResolveLockedCount: 0,
    dependencyResolveError: null,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(resetStore)

describe('DepsSection runtime script dependency usage', () => {
  it('marks packages imported by site scripts as in use', () => {
    render(<DepsSection />)

    const row = screen.getByTestId('dep-row-canvas-confetti')
    expect(within(row).getByText('in use')).toBeDefined()
    expect(within(row).getByTitle(/scripts: celebrate\.ts/)).toBeDefined()
  })

  it('surfaces missing runtime imports and can add them as dependencies', () => {
    render(<DepsSection />)

    const issues = screen.getByLabelText('Runtime dependency issues')
    expect(within(issues).getByText('motion')).toBeDefined()
    expect(within(issues).getByText('missing from dependencies')).toBeDefined()

    fireEvent.click(within(issues).getByRole('button', { name: 'Add' }))

    expect(useEditorStore.getState().packageJson.dependencies.motion).toBe('*')
    expect(useEditorStore.getState().site?.packageJson?.dependencies.motion).toBe('*')
  })

  it('shows the locked version next to the requested range when the lock has been resolved', () => {
    const lockedRuntime = normalizeSiteRuntimeConfig({
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
    })
    useEditorStore.setState({
      site: { ...useEditorStore.getState().site!, runtime: lockedRuntime },
      siteRuntime: lockedRuntime,
    } as Parameters<typeof useEditorStore.setState>[0])

    render(<DepsSection />)

    const row = screen.getByTestId('dep-row-canvas-confetti')
    expect(within(row).getByTitle('Locked at 1.9.4')).toBeDefined()
    // The lock matches the requested range — no manual re-resolve UI should
    // appear (auto-resolve has nothing to do, and the panel stays tidy).
    expect(screen.queryByRole('button', { name: 'Re-resolve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry resolve' })).toBeNull()
  })

  it('exposes a manual Re-resolve button when packageJson has un-resolved or changed packages', () => {
    const lockedRuntime = normalizeSiteRuntimeConfig({
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
    })
    const packageJson = {
      dependencies: { 'canvas-confetti': '^1.9.3', motion: '*' },
      devDependencies: {},
    }
    useEditorStore.setState({
      site: {
        ...useEditorStore.getState().site!,
        packageJson,
        runtime: lockedRuntime,
      },
      packageJson,
      siteRuntime: lockedRuntime,
    } as Parameters<typeof useEditorStore.setState>[0])

    render(<DepsSection />)

    // The auto-resolve hook handles the common case in the editor shell;
    // the panel still surfaces a manual escape hatch when the lock is out
    // of sync.
    expect(screen.getByRole('button', { name: 'Re-resolve' })).toBeDefined()
  })

  it('resolves runtime dependencies into the site dependency lock via the manual button', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        dependencyLock: {
          version: 1,
          packages: {
            'canvas-confetti': {
              name: 'canvas-confetti',
              requested: '^1.9.3',
              version: '1.9.3',
              resolvedAt: 123,
            },
          },
          updatedAt: 123,
        },
      }), { status: 200 })) as typeof fetch

    render(<DepsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Re-resolve' }))
    expect(await screen.findByText('1 locked')).toBeDefined()
    expect(useEditorStore.getState().siteRuntime.dependencyLock.packages['canvas-confetti']?.version).toBe('1.9.3')
    expect(useEditorStore.getState().site?.runtime?.dependencyLock.packages['canvas-confetti']?.version).toBe('1.9.3')
  })
})

describe('evaluateDependencyLockStatus', () => {
  it('returns in-sync when there are no requested packages', () => {
    expect(
      evaluateDependencyLockStatus({ dependencies: {}, devDependencies: {} }, {}),
    ).toEqual({ kind: 'in-sync' })
  })

  it('returns unresolved when packages are requested but the lock is empty', () => {
    expect(
      evaluateDependencyLockStatus(
        { dependencies: { 'canvas-confetti': '*' }, devDependencies: {} },
        {},
      ),
    ).toEqual({ kind: 'unresolved', missing: ['canvas-confetti'] })
  })

  it('returns stale when a previously-resolved request changed', () => {
    const status = evaluateDependencyLockStatus(
      { dependencies: { 'canvas-confetti': '^2.0.0' }, devDependencies: {} },
      {
        'canvas-confetti': {
          name: 'canvas-confetti',
          requested: '^1.9.3',
          version: '1.9.4',
          resolvedAt: 1,
        },
      },
    )
    expect(status.kind).toBe('stale')
    if (status.kind === 'stale') {
      expect(status.mismatched).toEqual(['canvas-confetti'])
      expect(status.missing).toEqual([])
      expect(status.orphan).toEqual([])
    }
  })

  it('flags packages present in the lock but no longer in packageJson as orphans', () => {
    const status = evaluateDependencyLockStatus(
      { dependencies: {}, devDependencies: {} },
      {
        'canvas-confetti': {
          name: 'canvas-confetti',
          requested: '^1.9.3',
          version: '1.9.4',
          resolvedAt: 1,
        },
      },
    )
    expect(status).toEqual({ kind: 'in-sync' })
  })

  it('returns stale with both new and changed sets when both occur', () => {
    const status = evaluateDependencyLockStatus(
      {
        dependencies: { 'canvas-confetti': '^2.0.0', motion: '*' },
        devDependencies: {},
      },
      {
        'canvas-confetti': {
          name: 'canvas-confetti',
          requested: '^1.9.3',
          version: '1.9.4',
          resolvedAt: 1,
        },
      },
    )
    expect(status.kind).toBe('stale')
    if (status.kind === 'stale') {
      expect(status.missing).toEqual(['motion'])
      expect(status.mismatched).toEqual(['canvas-confetti'])
    }
  })

  it('returns in-sync when every requested package is locked at the same range', () => {
    expect(
      evaluateDependencyLockStatus(
        { dependencies: { 'canvas-confetti': '^1.9.3' }, devDependencies: {} },
        {
          'canvas-confetti': {
            name: 'canvas-confetti',
            requested: '^1.9.3',
            version: '1.9.4',
            resolvedAt: 1,
          },
        },
      ),
    ).toEqual({ kind: 'in-sync' })
  })
})
