/**
 * Architecture Gate — admin typography token policy.
 *
 * Admin and shared UI chrome must use the global fluid text scale from
 * `src/styles/globals.css` instead of hardcoded pixel font sizes. Published
 * module CSS is intentionally excluded because those styles ship to user pages.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [join(SRC_ROOT, 'admin'), join(SRC_ROOT, 'ui')]
const GLOBALS_CSS = join(SRC_ROOT, 'styles/globals.css')
const EDITOR_CHROME_INJECTOR = join(SRC_ROOT, 'admin/pages/site/canvas/EditorChromeInjector.tsx')

const ADMIN_TEXT_SIZE_TOKENS = [
  '--text-3xs',
  '--text-2xs',
  '--text-xs',
  '--text-s',
  '--text-m',
  '--text-l',
  '--text-xl',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
  '--text-5xl',
  '--text-6xl',
  '--text-7xl',
] as const

const HARDCODED_FONT_SIZE_RE = /font-size\s*:\s*-?\d+(?:\.\d+)?px\s*;/g
const HARDCODED_FONT_SHORTHAND_RE = /\bfont\s*:\s*[^;\n]*\d+(?:\.\d+)?px[^;\n]*;/g

function collectModuleCss(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      results.push(...collectModuleCss(full))
    } else if (extname(entry) === '.css' && entry.endsWith('.module.css')) {
      results.push(full)
    }
  }
  return results
}

/** Strip `/* ... *\/` block comments and `// ...` line comments. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function findHardcodedFontSizes(filePath: string, source: string): string[] {
  const offenders: string[] = []
  const lines = stripComments(source).split('\n')

  lines.forEach((line, index) => {
    HARDCODED_FONT_SIZE_RE.lastIndex = 0
    HARDCODED_FONT_SHORTHAND_RE.lastIndex = 0
    const match = HARDCODED_FONT_SIZE_RE.exec(line) ?? HARDCODED_FONT_SHORTHAND_RE.exec(line)
    if (!match) return
    offenders.push(`  ${relative(SRC_ROOT, filePath)}:${index + 1} -> ${line.trim().slice(0, 140)}`)
  })

  return offenders
}

describe('admin typography tokens', () => {
  it('declares the full admin fluid text scale in globals.css', () => {
    const globals = readFileSync(GLOBALS_CSS, 'utf8')

    for (const token of ADMIN_TEXT_SIZE_TOKENS) {
      expect(globals).toContain(`${token}: clamp(`)
    }
  })

  it('uses fluid text tokens instead of hardcoded font-size pixels in admin/ui CSS modules', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectModuleCss(root)) {
        offenders.push(...findHardcodedFontSizes(filePath, readFileSync(filePath, 'utf8')))
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded font-size pixels found in admin / ui CSS modules.\n' +
          'Use the fluid admin text scale from src/styles/globals.css, for example `font-size: var(--text-s)`.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })

  it('uses chrome text tokens instead of hardcoded font-size pixels in the iframe editor chrome', () => {
    const offenders = findHardcodedFontSizes(
      EDITOR_CHROME_INJECTOR,
      readFileSync(EDITOR_CHROME_INJECTOR, 'utf8'),
    )

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded font-size pixels found in EditorChromeInjector chrome CSS.\n' +
          'Use chrome-namespaced text tokens so admin typography does not overwrite site Framework tokens.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })
})
