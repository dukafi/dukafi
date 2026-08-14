/**
 * Architecture Gate — CSS token policy.
 *
 * Editor chrome and admin shell CSS modules must source every color from a
 * design token in `src/styles/globals.css`. Raw hex colors and modern
 * `rgb()` / `hsl()` color functions in `.module.css` files inside
 * `src/admin/`, `src/admin/pages/site/`, and `src/ui/` are banned.
 *
 * Module CSS in `src/modules/` is intentionally exempt — those styles ship to
 * the published page output (no editor tokens available there).
 *
 * The scan strips `/* ... *\/` block comments and `//` line comments before
 * matching, so comment-style references like "Task #462" or "Guideline #357"
 * do not trigger false positives.
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [
  join(SRC_ROOT, 'admin'),
  join(SRC_ROOT, 'editor'),
  join(SRC_ROOT, 'ui'),
]

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
const RAW_COLOR_FUNCTION_RE = /\b(?:rgba?|hsla?)\(/g

function collectModuleCss(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectModuleCss(full))
    } else if (extname(entry) === '.css' && entry.endsWith('.module.css')) {
      results.push(full)
    }
  }
  return results
}

/** Strip `/* ... *\/` block comments and `// ...` line comments from the source. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('CSS token policy — no raw colors in editor/admin/ui CSS modules', () => {
  it('every color in src/admin, src/admin/pages/site, and src/ui CSS modules comes from a token', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectModuleCss(root)) {
        const raw = readFileSync(filePath, 'utf8')
        const stripped = stripComments(raw)

        const lines = stripped.split('\n')
        lines.forEach((line, index) => {
          // Re-scan; reset lastIndex on each line because we use /g.
          HEX_COLOR_RE.lastIndex = 0
          RAW_COLOR_FUNCTION_RE.lastIndex = 0
          const hexMatch = HEX_COLOR_RE.exec(line)
          const rawFunctionMatch = RAW_COLOR_FUNCTION_RE.exec(line)
          if (hexMatch || rawFunctionMatch) {
            offenders.push(
              `  ${relative(SRC_ROOT, filePath)}:${index + 1} -> ${line.trim().slice(0, 120)}`,
            )
          }
        })
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded colors found in editor / admin / ui CSS modules.\n' +
          'Replace each value with a design token from src/styles/globals.css.\n' +
          'If the needed token does not exist yet, add it to globals.css first.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })
})
