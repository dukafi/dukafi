import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '../../..')
const RUNTIME_SOURCE_ROOTS = ['server', 'src/admin', 'src/core']

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('Single-install CMS architecture', () => {
  it('keeps the CMS database single-site instead of tenant-scoped', () => {
    const pg = read('server/db/migrations-pg.ts')
    const sqlite = read('server/db/migrations-sqlite.ts')

    for (const src of [pg, sqlite]) {
      expect(src).toContain('create table if not exists site')
      expect(src).not.toMatch(/\bcreate table\s+if not exists\s+sites\b/i)
      expect(src).not.toMatch(/\buser_site_/)
      expect(src).not.toMatch(/\bsite_id\b/)
    }
  })

  it('does not keep runtime tenant or CMS-internal multi-site identifiers', () => {
    const forbidden = [
      /\btenant_id\b/i,
      /\bworkspace_id\b/i,
      /\buser_site_/i,
      /\bmulti-site-ready\b/i,
      /\btenant-aware\b/i,
      /\bcross-site\b/i,
      /\bsite picker\b/i,
    ]

    const offenders: string[] = []
    for (const root of RUNTIME_SOURCE_ROOTS) {
      for (const file of new Bun.Glob('**/*.{ts,tsx}').scanSync(join(ROOT, root))) {
        const path = join(root, file)
        const src = read(path)
        for (const pattern of forbidden) {
          if (pattern.test(src)) offenders.push(`${path}: ${pattern}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
