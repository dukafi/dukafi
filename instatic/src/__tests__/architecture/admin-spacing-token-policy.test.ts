/**
 * Architecture Gate — admin spacing token policy.
 *
 * Admin and shared UI chrome must use the global fluid spacing scale from
 * `src/styles/globals.css` instead of hardcoded pixel spacing. Published
 * module CSS is intentionally excluded because those styles ship to user pages.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [join(SRC_ROOT, 'admin'), join(SRC_ROOT, 'ui')]
const GLOBALS_CSS = join(SRC_ROOT, 'styles/globals.css')
const EDITOR_CHROME_INJECTOR = join(SRC_ROOT, 'admin/pages/site/canvas/EditorChromeInjector.tsx')

const ADMIN_SPACE_FLUID_TOKENS = [
  '--space-4xs',
  '--space-3xs',
  '--space-2xs',
  '--space-xs',
  '--space-s',
  '--space-m',
  '--space-l',
  '--space-xl',
  '--space-2xl',
  '--space-3xl',
  '--space-4xl',
  '--space-5xl',
  '--space-6xl',
  '--space-7xl',
  '--space-8xl',
  '--space-9xl',
  '--space-10xl',
  '--space-11xl',
  '--space-12xl',
] as const

const SPACING_DECLARATION_RE =
  /^\s*(?:margin(?:-(?:top|right|bottom|left|block|block-start|block-end|inline|inline-start|inline-end))?|padding(?:-(?:top|right|bottom|left|block|block-start|block-end|inline|inline-start|inline-end))?|gap|row-gap|column-gap)\s*:\s*[^;]*-?\d+(?:\.\d+)?px[^;]*;/gm

const INLINE_SPACING_RE =
  /\b(?:margin|padding|gap|rowGap|columnGap)\s*:\s*['"`][^'"`]*-?\d+(?:\.\d+)?px/g
const SVG_DIMENSION_RE =
  /\b(?:width|height|min-width|min-height|max-width|max-height|inline-size|block-size)\s*:\s*[^;]*\d+(?:\.\d+)?px[^;]*;/gm
const CSS_RULE_RE = /([^{}]+)\{([^{}]*)\}/g

function collectFiles(dir: string, extensions: ReadonlyArray<string>): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      results.push(...collectFiles(full, extensions))
    } else if (extensions.includes(extname(entry))) {
      if (extname(entry) === '.css' && !entry.endsWith('.module.css')) continue
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

function findSpacingDeclarations(filePath: string, source: string): string[] {
  const offenders: string[] = []
  const stripped = stripComments(source)

  for (const match of stripped.matchAll(SPACING_DECLARATION_RE)) {
    const before = stripped.slice(0, match.index ?? 0)
    const line = before.split('\n').length
    offenders.push(`  ${relative(SRC_ROOT, filePath)}:${line} -> ${match[0].trim().slice(0, 140)}`)
  }

  return offenders
}

function findInlineSpacing(filePath: string, source: string): string[] {
  const offenders: string[] = []
  const stripped = stripComments(source)

  for (const match of stripped.matchAll(INLINE_SPACING_RE)) {
    const before = stripped.slice(0, match.index ?? 0)
    const line = before.split('\n').length
    offenders.push(`  ${relative(SRC_ROOT, filePath)}:${line} -> ${match[0].trim().slice(0, 140)}`)
  }

  return offenders
}

function findSvgDimensions(filePath: string, source: string): string[] {
  const offenders: string[] = []
  const stripped = stripComments(source)

  for (const rule of stripped.matchAll(CSS_RULE_RE)) {
    const selector = rule[1]?.trim() ?? ''
    if (!/\bsvg\b|:global\(svg\)/i.test(selector)) continue

    const body = rule[2] ?? ''
    const ruleIndex = rule.index ?? 0
    for (const match of body.matchAll(SVG_DIMENSION_RE)) {
      const matchIndex = ruleIndex + rule[0].indexOf(body) + (match.index ?? 0)
      const before = stripped.slice(0, matchIndex)
      const line = before.split('\n').length
      offenders.push(`  ${relative(SRC_ROOT, filePath)}:${line} -> ${selector} { ${match[0].trim()} }`)
    }
  }

  return offenders
}

describe('admin spacing tokens', () => {
  it('declares the admin fluid spacing scale in globals.css', () => {
    const globals = readFileSync(GLOBALS_CSS, 'utf8')

    expect(globals).toContain('--space-px: 1px;')
    for (const token of ADMIN_SPACE_FLUID_TOKENS) {
      expect(globals).toContain(`${token}: clamp(`)
    }
  })

  it('uses spacing tokens instead of hardcoded pixels for margin/padding/gap in admin/ui CSS modules', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectFiles(root, ['.css'])) {
        offenders.push(...findSpacingDeclarations(filePath, readFileSync(filePath, 'utf8')))
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded margin/padding/gap pixels found in admin / ui CSS modules.\n' +
          'Use the fluid admin spacing scale from src/styles/globals.css, for example `padding: var(--space-s)`.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })

  it('does not use inline pixel spacing strings in admin/ui sources', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectFiles(root, ['.ts', '.tsx'])) {
        offenders.push(...findInlineSpacing(filePath, readFileSync(filePath, 'utf8')))
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Inline pixel spacing strings found in admin / ui sources.\n' +
          'Move static spacing into CSS Modules and use the admin spacing scale.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })

  it('uses spacing tokens for CSS-authored SVG dimensions in admin/ui CSS modules', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const filePath of collectFiles(root, ['.css'])) {
        offenders.push(...findSvgDimensions(filePath, readFileSync(filePath, 'utf8')))
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded SVG dimensions found in admin / ui CSS modules.\n' +
          'Use the fluid admin spacing scale for SVG width/height values.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })

  it('uses chrome spacing aliases instead of hardcoded pixel spacing in the iframe editor chrome', () => {
    const offenders = findSpacingDeclarations(
      EDITOR_CHROME_INJECTOR,
      readFileSync(EDITOR_CHROME_INJECTOR, 'utf8'),
    )

    if (offenders.length > 0) {
      throw new Error(
        'Hardcoded margin/padding/gap pixels found in EditorChromeInjector chrome CSS.\n' +
          'Use chrome-namespaced spacing tokens so admin spacing does not overwrite site Framework tokens.\n\n' +
          'Violations:\n' +
          offenders.join('\n'),
      )
    }

    expect(offenders).toEqual([])
  })
})
