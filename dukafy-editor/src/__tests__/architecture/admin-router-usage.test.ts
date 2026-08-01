import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

function collectFiles(dir: string, exts = ['.ts', '.tsx']): string[] {
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

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('Admin router usage', () => {
  it('admin UI does not hard-navigate to internal /admin routes with raw anchors', () => {
    const files = collectFiles(join(SRC_ROOT, 'admin'))
    const violations: string[] = []
    const rawAdminHrefRe = /\bhref\s*=\s*(?:"\/admin\b|'\/admin\b|{\s*["']\/admin\b)/g

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(rawAdminHrefRe)) {
        violations.push(`${file.replace(SRC_ROOT, 'src/')}:${lineNumberFor(source, match.index ?? 0)}`)
      }
    }

    if (violations.length > 0) {
      throw new Error(
        'Use @admin/lib/routing Link or useAdminNavigate for internal admin navigation:\n' +
          violations.map((entry) => `  ${entry}`).join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('admin, core, and modules do not import react-router-dom', () => {
    const files = [
      ...collectFiles(join(SRC_ROOT, 'admin')),
      ...collectFiles(join(SRC_ROOT, 'core')),
      ...collectFiles(join(SRC_ROOT, 'modules')),
    ]
    const violations = files.filter((file) =>
      /from\s+['"]react-router-dom['"]/.test(readFileSync(file, 'utf8')),
    )

    if (violations.length > 0) {
      throw new Error(
        'Use the in-house admin router instead of react-router-dom:\n' +
          violations.map((file) => `  ${file.replace(SRC_ROOT, 'src/')}`).join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })

  it('core and modules do not import the admin router', () => {
    const files = [
      ...collectFiles(join(SRC_ROOT, 'core')),
      ...collectFiles(join(SRC_ROOT, 'modules')),
    ]
    const violations = files.filter((file) =>
      /from\s+['"](?:@admin\/lib\/routing|(?:[./]+)admin\/lib\/routing)['"]/.test(readFileSync(file, 'utf8')),
    )

    if (violations.length > 0) {
      throw new Error(
        'Core engine and published modules must not depend on admin routing:\n' +
          violations.map((file) => `  ${file.replace(SRC_ROOT, 'src/')}`).join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})
