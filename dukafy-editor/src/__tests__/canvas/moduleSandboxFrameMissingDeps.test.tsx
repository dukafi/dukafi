/**
 * `ModuleSandboxFrame` short-circuits to a friendly empty state when the
 * module declares dependencies that aren't installed yet. Before this
 * change the iframe mounted unconditionally and `import * as THREE from
 * 'three'` exploded as a raw `TypeError: Failed to resolve module
 * specifier` inside the sandbox.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ModuleSandboxFrame } from '@site/canvas/ModuleSandboxFrame'
import { useEditorStore } from '@site/store/store'
import { makeSite } from '../fixtures'
import { normalizeSiteRuntimeConfig } from '@core/site-runtime'
import type { AnyModuleDefinition } from '@core/module-engine'

afterEach(cleanup)

const MODULE: AnyModuleDefinition = {
  id: 'acme.three-kit.hero-background',
  name: 'Hero Background',
  category: 'Three Kit',
  version: '1.0.0',
  defaults: {},
  schema: {},
  icon: undefined as unknown as AnyModuleDefinition['icon'],
  component: (() => null) as unknown as AnyModuleDefinition['component'],
  render: () => ({ html: '' }),
  dependencies: { three: '^0.169.0' },
  editorRuntime: {
    sandbox: { source: `export function mount() {}`, minHeight: 320 },
  },
}

/**
 * Seed the editor store. When `installed: true`, populate the site's
 * runtime importmap so `ModuleSandboxFrame`'s "is the importmap ready?"
 * gate clears and the iframe mounts. Real flow: `Resolve runtime` writes
 * both `dependencyLock` + `packageImportmap` after `bun install` runs.
 */
function seed(packageDeps: Record<string, string>, opts: { installed?: boolean } = {}) {
  const packageJson = { dependencies: packageDeps, devDependencies: {} }
  const baseRuntime = normalizeSiteRuntimeConfig(undefined)
  const runtime = opts.installed
    ? normalizeSiteRuntimeConfig({
      ...baseRuntime,
      packageImportmap: {
        lockHash: 'test-hash',
        imports: Object.fromEntries(
          Object.keys(packageDeps).flatMap((name) => [
            [name, `/_instatic/runtime/cache/test-hash/${name}/index.js`],
            [`${name}/`, `/_instatic/runtime/cache/test-hash/${name}/`],
          ]),
        ),
      },
    })
    : baseRuntime
  useEditorStore.setState({
    site: makeSite({ packageJson, runtime }),
    packageJson,
    siteRuntime: runtime,
  } as Parameters<typeof useEditorStore.setState>[0])
}

describe('ModuleSandboxFrame — missing dependency empty state', () => {
  beforeEach(() => seed({}))

  it('renders the shared placeholder primitive instead of the iframe when a declared dep is missing', () => {
    const { container } = render(
      <ModuleSandboxFrame
        moduleDefinition={MODULE}
        props={{}}
        nodeId="node-1"
        isSelected={false}
      />,
    )

    const card = container.querySelector('[data-canvas-module-placeholder]')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('Hero Background needs 1 package')).toBeDefined()
    expect(within(card as HTMLElement).getByText('three@^0.169.0')).toBeDefined()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('marks the action row as canvas-interactive so clicks reach the buttons', () => {
    render(
      <ModuleSandboxFrame
        moduleDefinition={MODULE}
        props={{}}
        nodeId="node-1"
        isSelected={false}
      />,
    )

    const button = screen.getByTestId('module-sandbox-missing-deps-add')
    // NodeWrapper opts out of canvas selection capture for any target that
    // has `data-canvas-interactive="true"` on itself or an ancestor.
    expect(button.closest('[data-canvas-interactive="true"]')).not.toBeNull()
  })

  it('one-click "Add" writes the declared package into site packageJson and opens the panel', () => {
    render(
      <ModuleSandboxFrame
        moduleDefinition={MODULE}
        props={{}}
        nodeId="node-1"
        isSelected={false}
      />,
    )

    expect(useEditorStore.getState().dependenciesPanelOpen).toBe(false)
    fireEvent.click(screen.getByTestId('module-sandbox-missing-deps-add'))
    expect(useEditorStore.getState().packageJson.dependencies.three).toBe('^0.169.0')
    expect(useEditorStore.getState().dependenciesPanelOpen).toBe(true)
  })

  it('mounts the iframe once dependencies are installed', () => {
    seed({ three: '^0.169.0' }, { installed: true })

    const { container } = render(
      <ModuleSandboxFrame
        moduleDefinition={MODULE}
        props={{}}
        nodeId="node-1"
        isSelected={false}
      />,
    )

    expect(container.querySelector('[data-canvas-module-placeholder]')).toBeNull()
    expect(container.querySelector('iframe')).not.toBeNull()
  })

  it('keeps the placeholder while runtime cache is still resolving', () => {
    // Dep declared in package.json but importmap hasn't been built yet
    // (e.g. legacy persisted state, or background `bun install` running).
    // The iframe must NOT mount — otherwise three.js fails to resolve.
    seed({ three: '^0.169.0' })

    const { container } = render(
      <ModuleSandboxFrame
        moduleDefinition={MODULE}
        props={{}}
        nodeId="node-1"
        isSelected={false}
      />,
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[data-canvas-module-placeholder]')).not.toBeNull()
  })
})
