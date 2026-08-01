import { describe, expect, it } from 'bun:test'
import { createModuleImportMap, resolveDependencyUrl } from '@core/module-engine'
import type { AnyModuleDefinition } from '@core/module-engine'
import type { RuntimePackageImportmap } from '@core/site-runtime'

function makeModule(dependencies: AnyModuleDefinition['dependencies']): AnyModuleDefinition {
  return {
    id: 'test.runtime-deps',
    name: 'Runtime deps',
    category: 'Test',
    version: '1.0.0',
    trusted: true,
    canHaveChildren: false,
    schema: {},
    defaults: {},
    dependencies,
    component: () => null,
    render: () => ({ html: '<div></div>' }),
  }
}

const SITE_IMPORTMAP: RuntimePackageImportmap = {
  lockHash: 'abc123def456ghi789jkl012',
  imports: {
    three: '/_instatic/runtime/cache/abc123def456ghi789jkl012/three/build/three.module.js',
    'three/': '/_instatic/runtime/cache/abc123def456ghi789jkl012/three/',
    typescript: '/_instatic/runtime/cache/abc123def456ghi789jkl012/typescript/lib/typescript.js',
  },
}

describe('runtime dependency resolver', () => {
  it('looks up a single package URL in the site importmap', () => {
    expect(
      resolveDependencyUrl({ name: 'three' }, { siteImportmap: SITE_IMPORTMAP }),
    ).toBe('/_instatic/runtime/cache/abc123def456ghi789jkl012/three/build/three.module.js')
  })

  it('returns null when no site importmap is provided', () => {
    expect(resolveDependencyUrl({ name: 'three' })).toBeNull()
  })

  it('builds an import map filtered to the module declared deps', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      { siteImportmap: SITE_IMPORTMAP },
    )
    expect(importMap.imports.three).toBe(
      '/_instatic/runtime/cache/abc123def456ghi789jkl012/three/build/three.module.js',
    )
    expect(importMap.imports['three/']).toBe(
      '/_instatic/runtime/cache/abc123def456ghi789jkl012/three/',
    )
    // typescript is in the site importmap but not in this module's deps —
    // it stays out so the iframe surface is focused.
    expect(importMap.imports.typescript).toBeUndefined()
  })

  it('emits an empty import map when no site importmap is provided', () => {
    // No site importmap (= deps not resolved yet). The iframe shouldn't
    // mount until `Resolve runtime` has run; the resolver communicates
    // that by returning an empty map.
    const importMap = createModuleImportMap(makeModule({ three: '^0.184.0' }))
    expect(importMap.imports).toEqual({})
  })

  it('does not expose dev dependencies to the editor runtime import map', () => {
    const importMap = createModuleImportMap(
      makeModule({
        three: '^0.184.0',
        typescript: { version: '^5.3.0', dev: true },
      }),
      { siteImportmap: SITE_IMPORTMAP },
    )
    expect(importMap.imports.three).toBeDefined()
    expect(importMap.imports.typescript).toBeUndefined()
  })

  it('drops module deps absent from the site manifest in strict mode', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      {
        packageJson: {
          dependencies: {},
          devDependencies: {},
        },
        siteImportmap: SITE_IMPORTMAP,
        strictSiteManifest: true,
      },
    )
    expect(importMap.imports.three).toBeUndefined()
    expect(importMap.imports['three/']).toBeUndefined()
  })

  it('does not resolve runtime dependencies from devDependencies in strict manifest mode', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      {
        packageJson: {
          dependencies: {},
          devDependencies: { three: '^0.185.0' },
        },
        siteImportmap: SITE_IMPORTMAP,
        strictSiteManifest: true,
      },
    )
    expect(importMap.imports.three).toBeUndefined()
  })
})
