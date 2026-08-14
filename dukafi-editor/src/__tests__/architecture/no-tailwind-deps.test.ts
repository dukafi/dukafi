/**
 * Architecture Source-Scan — Tailwind / shadcn dependency ban
 *
 * This codebase uses CSS Modules with custom CSS tokens only.
 * Tailwind, tailwind-merge, class-variance-authority, clsx, and @radix-ui/*
 * are all prohibited. The `cn` helper lives in `src/ui/cn.ts` as an
 * in-house 3-line implementation with no external dependencies.
 *
 * Gates:
 *   - No TypeScript/JavaScript file under src/ imports from a banned package.
 *   - No CSS file under src/ contains @tailwind or @apply directives.
 *
 * @see CLAUDE.md — Class composition section
 * @see src/ui/cn.ts — in-house cn implementation
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

// ---------------------------------------------------------------------------
// File walkers
// ---------------------------------------------------------------------------

function collectFiles(dir: string, exts: string[]): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, exts))
    } else if (exts.includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

function collectTsFiles(): string[] {
  // Scan all source dirs that contain production code.
  // Exclude __tests__ — test files contain banned strings as regex patterns
  // and would false-positive.
  const PROD_DIRS = ['admin', 'core', 'modules', 'ui'].map((d) => join(SRC_ROOT, d))
  return PROD_DIRS.flatMap((dir) => collectFiles(dir, ['.ts', '.tsx']))
}

function collectCssFiles(): string[] {
  const ALL_SRC = join(SRC_ROOT)
  return collectFiles(ALL_SRC, ['.css']).filter(
    // Exclude node_modules (should not be under SRC_ROOT but be safe)
    (f) => !f.includes('node_modules'),
  )
}

// ---------------------------------------------------------------------------
// Banned JS/TS import patterns
//
// Strings are split to prevent this test file from self-matching.
// ---------------------------------------------------------------------------

const BANNED_IMPORTS: { name: string; pattern: RegExp }[] = [
  {
    name: 'clsx',
    pattern: new RegExp(`from\\s+['"]` + `clsx['"]|require\\s*\\(\\s*['"]` + `clsx['"]\\s*\\)`),
  },
  {
    name: 'tailwind-merge',
    pattern: new RegExp(`from\\s+['"]` + `tailwind-merge['"]|require\\s*\\(\\s*['"]` + `tailwind-merge['"]\\s*\\)`),
  },
  {
    name: 'class-variance-authority',
    pattern: new RegExp(`from\\s+['"]` + `class-variance-authority['"]|from\\s+['"]` + `cva['"]`),
  },
  {
    name: '@radix-ui/*',
    // Covers any @radix-ui sub-package (e.g. @radix-ui/react-dialog)
    pattern: new RegExp(`from\\s+['"]@radix` + `-ui/`),
  },
  {
    name: 'tailwindcss',
    pattern: new RegExp(`from\\s+['"]` + `tailwindcss['"]|require\\s*\\(\\s*['"]` + `tailwindcss['"]\\s*\\)`),
  },
]

// ---------------------------------------------------------------------------
// Banned CSS directives
// ---------------------------------------------------------------------------

const BANNED_CSS_DIRECTIVES: { name: string; pattern: RegExp }[] = [
  {
    name: '@tailwind',
    pattern: /@tailwind\b/,
  },
  {
    name: '@apply',
    pattern: /@apply\b/,
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('No Tailwind / shadcn / clsx dependencies in production source', () => {
  it('no TypeScript/TSX file imports from a banned Tailwind-ecosystem package', () => {
    const allFiles = collectTsFiles()
    const violations: { file: string; pkg: string }[] = []

    for (const banned of BANNED_IMPORTS) {
      for (const f of allFiles) {
        let src: string
        try {
          src = readFileSync(f, 'utf8')
        } catch {
          continue
        }
        if (banned.pattern.test(src)) {
          violations.push({ file: relative(SRC_ROOT, f), pkg: banned.name })
        }
      }
    }

    if (violations.length > 0) {
      const lines = violations.map((v) => `  src/${v.file}  [banned import: ${v.pkg}]`)
      throw new Error(
        'Banned Tailwind-ecosystem package imports found in production source.\n' +
          'This codebase uses CSS Modules — use cn() from @ui/cn (no external deps).\n' +
          'Banned packages: clsx, tailwind-merge, class-variance-authority, @radix-ui/*, tailwindcss\n' +
          'See: no-tailwind-deps.test.ts and CLAUDE.md (Class composition section)\n' +
          'Violations:\n' +
          lines.join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('no CSS file contains @tailwind or @apply directives', () => {
    const allCssFiles = collectCssFiles()
    const violations: { file: string; directive: string; line: number }[] = []

    for (const f of allCssFiles) {
      let src: string
      try {
        src = readFileSync(f, 'utf8')
      } catch {
        continue
      }

      src.split('\n').forEach((line, idx) => {
        for (const banned of BANNED_CSS_DIRECTIVES) {
          if (banned.pattern.test(line)) {
            violations.push({ file: relative(SRC_ROOT, f), directive: banned.name, line: idx + 1 })
          }
        }
      })
    }

    if (violations.length > 0) {
      const lines = violations.map((v) => `  ${v.file}:${v.line}  [${v.directive}]`)
      throw new Error(
        'Tailwind CSS directives found in stylesheet files.\n' +
          'This codebase uses plain CSS Modules — @tailwind and @apply are not allowed.\n' +
          'Violations:\n' +
          lines.join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})
