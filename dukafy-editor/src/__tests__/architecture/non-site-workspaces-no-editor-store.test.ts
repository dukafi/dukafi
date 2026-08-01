import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'

const SRC_ROOT = join(import.meta.dir, '../../')

const CHECKED_PATHS = [
  'admin/layouts/AdminWorkspaceCanvasLayout',
  'admin/pages/content',
  'admin/pages/data',
  'admin/pages/media',
]

const FORBIDDEN_EDITOR_STORE_IMPORT_RE =
  /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"])(?:@site\/store\/store|@admin\/pages\/site\/store\/store)['"]/g

function collectTsFiles(dir: string): string[] {
  const files: string[] = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(full))
      continue
    }
    if (['.ts', '.tsx'].includes(extname(entry))) files.push(full)
  }
  return files
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('Non-site workspace editor-store boundary', () => {
  it('Content, Data, Media, and their shared workspace layout do not import the Site editor store', () => {
    const violations: string[] = []
    const files = CHECKED_PATHS.flatMap((path) => collectTsFiles(join(SRC_ROOT, path)))

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(FORBIDDEN_EDITOR_STORE_IMPORT_RE)) {
        violations.push(`${file.replace(SRC_ROOT, 'src/')}:${lineNumberFor(source, match.index ?? 0)}`)
      }
    }

    if (violations.length > 0) {
      throw new Error(
        'Non-site workspaces must use admin-level workspace state, not @site/store/store:\n' +
          violations.map((entry) => `  ${entry}`).join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})
