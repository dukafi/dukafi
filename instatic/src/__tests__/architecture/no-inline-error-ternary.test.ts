import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

/**
 * Gate: no inline `err instanceof Error ? err.message : <fallback>` ternaries.
 *
 * `getErrorMessage(err, fallback)` in `src/core/utils/errorMessage.ts` is the
 * single canonical user-facing error extractor — it folds the `instanceof`
 * check and the empty-message fallback into one place. Re-hand-writing the
 * ternary at a call site re-decides the fallback wording and silently drops
 * the empty-message case `getErrorMessage` handles. Use `getErrorMessage`.
 */

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [join(SRC_ROOT, 'admin')]

// `<var> instanceof Error ? <var>.message` — the extraction half of the ternary.
const INLINE_ERROR_TERNARY_RE = /\binstanceof Error\s*\?\s*[A-Za-z_$][\w$]*\.message/

/**
 * Genuinely-legitimate remaining uses, relative to `src/`. Keep this empty —
 * every error-message extraction in `src/admin` must route through
 * `getErrorMessage`. Add an entry only for a use of `instanceof Error` that is
 * NOT an error-message extraction, with a one-line justification.
 */
const ALLOWLIST: ReadonlySet<string> = new Set([])

function collectFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full))
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('admin code uses getErrorMessage, not inline instanceof-Error ternaries', () => {
  it('has no `err instanceof Error ? err.message : ...` outside the allowlist', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectFiles(root)) {
        const rel = relative(SRC_ROOT, filePath)
        if (ALLOWLIST.has(rel)) continue
        const stripped = stripComments(readFileSync(filePath, 'utf8'))
        stripped.split('\n').forEach((line, index) => {
          if (INLINE_ERROR_TERNARY_RE.test(line)) {
            offenders.push(`  ${rel}:${index + 1} -> ${line.trim().slice(0, 120)}`)
          }
        })
      }
    }

    expect(offenders).toEqual([])
  })
})
