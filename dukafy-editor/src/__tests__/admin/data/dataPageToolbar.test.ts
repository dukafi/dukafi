import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../../../..')

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8')
}

describe('DataPage toolbar', () => {
  it('does not add a duplicate table settings action to the top toolbar', () => {
    const source = readSource('src/admin/pages/data/DataPage.tsx')

    expect(source).not.toMatch(/table settings/i)
    expect(source).not.toContain('Settings2SolidIcon')
  })
})
