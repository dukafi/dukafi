/**
 * Architecture gate: @instatic/host-ui runtime parity.
 *
 * Enforces that the three surfaces which constitute the plugin UI contract
 * are always in sync:
 *
 *   1. `src/admin/plugin-host-ui/index.ts` — the TypeScript contract
 *      plugins compile against (named runtime-value exports only;
 *      `export type` lines are ignored).
 *
 *   2. `src/admin/pluginRuntimeBootstrap.ts` — the host-side bootstrap that
 *      populates `globalThis.__instatic.hostUi` at editor startup.
 *
 *   3. `public/runtime/host-ui.js` — the ESM shim plugins actually import
 *      at runtime; reads from the global and re-exports named bindings.
 *
 * If any of these three diverge, the test fails with a clear sorted
 * symmetric-diff diagnostic naming the missing exports.
 *
 * Intent: add a runtime value export to the TS index → the bootstrap and
 * the shim must also be updated, OR this test fails loudly.
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8')

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Extract the set of runtime-value export names from the TS index.
 * Ignores `export type { ... }` and `export type Foo` lines entirely.
 * Handles multi-line `export { A as B, C }` blocks.
 */
function parseIndexRuntimeExports(src: string): Set<string> {
  const names = new Set<string>()

  // Strip `export type { ... }` multi-line blocks first so their contents
  // cannot be mistaken for runtime exports.
  const withoutTypeBlocks = src.replace(/export\s+type\s*\{[^}]*\}/gs, '')
  // Strip `export type Foo = ...` single-line type aliases.
  const code = withoutTypeBlocks.replace(/^export\s+type\s+\w[^\n]*$/gm, '')

  // Collect all `export { ... }` blocks (possibly multi-line).
  const blockRe = /export\s*\{([^}]*)\}/gs
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(code)) !== null) {
    const block = m[1]!
    // Each entry is `Name` or `LocalName as ExportedName`.
    for (const rawEntry of block.split(',')) {
      const entry = rawEntry.trim()
      if (!entry) continue
      const asMatch = entry.match(/\w+\s+as\s+(\w+)/)
      if (asMatch) {
        names.add(asMatch[1]!)
      } else {
        const bare = entry.match(/^(\w+)$/)
        if (bare) names.add(bare[1]!)
      }
    }
  }

  // Also catch `export const X`, `export function X`, `export class X`.
  for (const [, name] of code.matchAll(/^export\s+(?:const|function|class)\s+(\w+)/gm)) {
    names.add(name!)
  }

  return names
}

/**
 * Extract keys from the `hostUi: Object.freeze({ ... })` block in the
 * runtime bootstrap. Each property is a shorthand identifier on its own line.
 */
function parseBootstrapHostUiKeys(src: string): Set<string> {
  const names = new Set<string>()
  const m = src.match(/hostUi:\s*Object\.freeze\s*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (!m) return names
  for (const line of m[1]!.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    const ident = trimmed.match(/^(\w+)/)
    if (ident) names.add(ident[1]!)
  }
  return names
}

/**
 * Extract export names from `export const X = G.X` lines in the JS shim.
 */
function parseShimExports(src: string): Set<string> {
  const names = new Set<string>()
  for (const [, name] of src.matchAll(/^export\s+const\s+(\w+)\s*=/gm)) {
    names.add(name!)
  }
  return names
}

// ---------------------------------------------------------------------------
// Diagnostic helper
// ---------------------------------------------------------------------------

function symmetricDiff<T>(
  setA: Set<T>,
  labelA: string,
  setB: Set<T>,
  labelB: string,
): string | null {
  const onlyInA = [...setA].filter((x) => !setB.has(x)).sort()
  const onlyInB = [...setB].filter((x) => !setA.has(x)).sort()
  if (onlyInA.length === 0 && onlyInB.length === 0) return null
  const lines: string[] = ['plugin-host-ui parity mismatch:']
  if (onlyInA.length > 0)
    lines.push(`  only in ${labelA}: ${onlyInA.join(', ')}`)
  if (onlyInB.length > 0)
    lines.push(`  only in ${labelB}: ${onlyInB.join(', ')}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plugin-host-ui runtime parity', () => {
  const indexSrc = read('src/admin/plugin-host-ui/index.ts')
  const bootstrapSrc = read('src/admin/pluginRuntimeBootstrap.ts')
  const shimSrc = read('public/runtime/host-ui.js')

  const indexExports = parseIndexRuntimeExports(indexSrc)
  const bootstrapKeys = parseBootstrapHostUiKeys(bootstrapSrc)
  const shimExports = parseShimExports(shimSrc)

  it('pluginRuntimeBootstrap.ts hostUi keys match the TS index runtime exports', () => {
    const diff = symmetricDiff(
      indexExports,
      'src/admin/plugin-host-ui/index.ts',
      bootstrapKeys,
      'src/admin/pluginRuntimeBootstrap.ts (hostUi)',
    )
    expect(diff, diff ?? '').toBeNull()
  })

  it('public/runtime/host-ui.js shim exports match the TS index runtime exports', () => {
    const diff = symmetricDiff(
      indexExports,
      'src/admin/plugin-host-ui/index.ts',
      shimExports,
      'public/runtime/host-ui.js',
    )
    expect(diff, diff ?? '').toBeNull()
  })
})
