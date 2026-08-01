/**
 * Architecture Gate — Admin startup import shape
 *
 * The unauthenticated and bootstrapping admin shell is on every /admin first
 * paint. It may use narrow auth/boot persistence entrypoints, but it must not
 * import the full `@core/persistence` barrel because that barrel re-exports
 * data/media/plugin clients and pulls their chunks into startup.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_ROOT = join(import.meta.dir, '../../../')
const STARTUP_DIRS = [
  join(REPO_ROOT, 'src/admin/preauth'),
]

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(path))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

describe('admin startup imports', () => {
  it('pre-auth code does not import the full persistence barrel', () => {
    const offenders = STARTUP_DIRS
      .flatMap(listSourceFiles)
      .filter((file) => readFileSync(file, 'utf8').includes("from '@core/persistence'"))
      .map((file) => relative(REPO_ROOT, file))

    expect(offenders).toEqual([])
  })
})
