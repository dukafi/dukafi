import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [
  join(SRC_ROOT, 'admin'),
  join(SRC_ROOT, 'core'),
  join(SRC_ROOT, 'ui'),
]

const NATIVE_DIALOG_RE = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g

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

describe('native browser dialogs are not used in production app code', () => {
  it('uses app-owned dialogs instead of alert/confirm/prompt', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectFiles(root)) {
        const stripped = stripComments(readFileSync(filePath, 'utf8'))
        const lines = stripped.split('\n')
        lines.forEach((line, index) => {
          NATIVE_DIALOG_RE.lastIndex = 0
          if (NATIVE_DIALOG_RE.test(line)) {
            offenders.push(
              `  ${relative(SRC_ROOT, filePath)}:${index + 1} -> ${line.trim().slice(0, 120)}`,
            )
          }
        })
      }
    }

    expect(offenders).toEqual([])
  })
})
