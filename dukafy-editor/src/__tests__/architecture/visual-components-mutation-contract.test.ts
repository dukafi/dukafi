/**
 * Architecture gate — Visual Component mutations use SiteDocument helpers.
 *
 * The VC slice mutates `site.visualComponents`, page refs, and VC trees. Those
 * writes must go through the shared site mutation helpers so undo history,
 * dirty state, and timestamps behave exactly like page/tree mutations.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '../../../')
const VC_SLICE_PATH = join(ROOT, 'src/admin/pages/site/store/slices/visualComponentsSlice.ts')

describe('Visual Components mutation contract', () => {
  it('visualComponentsSlice does not mutate the SiteDocument with raw set()', () => {
    const source = readFileSync(VC_SLICE_PATH, 'utf8')
    expect(source).not.toMatch(/\bset\s*\(\s*\(\s*state\s*\)\s*=>/)
  })
})
