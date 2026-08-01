import { describe, expect, it } from 'bun:test'
import type { SiteFile } from '@core/files/schemas'
import {
  analyzeRuntimeScriptImports,
  extractRuntimeImportSpecifiers,
  packageNameFromImportSpecifier,
} from '@core/site-runtime'

function scriptFile(id: string, path: string, content: string): SiteFile {
  return {
    id,
    path,
    type: 'script',
    content,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('runtime script import analysis', () => {
  it('extracts ESM, re-export, side-effect, and literal dynamic import specifiers', () => {
    const specifiers = extractRuntimeImportSpecifiers(`
      import confetti from 'canvas-confetti'
      import { ease } from '@motionone/dom'
      import './local'
      import type { Options } from 'canvas-confetti'
      export { animate } from 'motion'
      export type { MotionValue } from 'motion'
      await import('three/examples/jsm/controls/OrbitControls.js')
      await import(getPackageName())
    `)

    expect(specifiers.map((entry) => [entry.kind, entry.specifier])).toEqual([
      ['static', 'canvas-confetti'],
      ['static', '@motionone/dom'],
      ['static', './local'],
      ['reexport', 'motion'],
      ['dynamic', 'three/examples/jsm/controls/OrbitControls.js'],
    ])
  })

  it('ignores imports that only appear inside comments and strings', () => {
    const specifiers = extractRuntimeImportSpecifiers(`
      // import bad from 'commented-package'
      const source = "import nope from 'string-package'"
      /*
       export { x } from 'block-comment-package'
       */
      const modules = import.meta.glob('./widgets/*.ts')
      import good from 'canvas-confetti'
    `)

    expect(specifiers.map((entry) => entry.specifier)).toEqual(['canvas-confetti'])
  })

  it('derives npm package names from bare package roots and subpaths', () => {
    expect(packageNameFromImportSpecifier('canvas-confetti')).toBe('canvas-confetti')
    expect(packageNameFromImportSpecifier('three/examples/jsm/Addons.js')).toBe('three')
    expect(packageNameFromImportSpecifier('@scope/pkg/sub/path')).toBe('@scope/pkg')
    expect(packageNameFromImportSpecifier('./local')).toBeNull()
    expect(packageNameFromImportSpecifier('https://cdn.example.com/pkg.js')).toBeNull()
  })

  it('collects package usage and reports missing or dev-only runtime dependencies', () => {
    const analysis = analyzeRuntimeScriptImports(
      [
        scriptFile('confetti', 'src/scripts/confetti.ts', `
          import confetti from 'canvas-confetti'
          import { animate } from 'motion'
          import '@scope/pkg/register'
          import vite from 'vite'
        `),
      ],
      {
        dependencies: {
          'canvas-confetti': '^1.9.3',
          '@scope/pkg': '^2.0.0',
        },
        devDependencies: {
          vite: '^7.0.0',
        },
      },
    )

    expect([...analysis.usage.keys()]).toEqual(['canvas-confetti', 'motion', '@scope/pkg', 'vite'])
    expect(analysis.usage.get('canvas-confetti')?.files).toEqual([
      { fileId: 'confetti', path: 'src/scripts/confetti.ts' },
    ])
    expect(analysis.usage.get('@scope/pkg')?.specifiers).toEqual(['@scope/pkg/register'])
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'runtime-dependency-missing',
      'runtime-dependency-dev-only',
    ])
    expect(analysis.diagnostics[0]).toMatchObject({
      packageName: 'motion',
      fileId: 'confetti',
      severity: 'error',
    })
    expect(analysis.diagnostics[1]).toMatchObject({
      packageName: 'vite',
      fileId: 'confetti',
      severity: 'error',
    })
  })

  it('reports unsafe package specifiers before they can reach a resolver', () => {
    const analysis = analyzeRuntimeScriptImports(
      [scriptFile('unsafe', 'src/scripts/unsafe.ts', `import bad from 'bad;pkg'`)],
      { dependencies: {}, devDependencies: {} },
    )

    expect(analysis.usage.size).toBe(0)
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: 'runtime-dependency-invalid-name',
        packageName: 'bad;pkg',
        severity: 'error',
      }),
    ])
  })

  it('rejects Node builtin imports in browser runtime scripts', () => {
    const analysis = analyzeRuntimeScriptImports(
      [scriptFile('node-api', 'src/scripts/node-api.ts', `import fs from 'node:fs'; import path from 'path'`)],
      { dependencies: {}, devDependencies: {} },
    )

    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'runtime-dependency-node-builtin',
      'runtime-dependency-node-builtin',
    ])
    expect(analysis.diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(true)
  })
})
