import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dataTableCss = readFileSync(
  join(import.meta.dir, '../../ui/components/DataTable/DataTable.module.css'),
  'utf8',
)

describe('DataTable visual density', () => {
  it('is a square grid with cell borders and no rounded row pills', () => {
    expect(dataTableCss).toContain('border-collapse: collapse')
    expect(dataTableCss).toContain('border-right: 1px solid var(--border)')
    expect(dataTableCss).toContain('border-bottom: 1px solid var(--border)')
    expect(dataTableCss).toContain('.table tbody .row:hover')
    expect(dataTableCss).not.toContain('border-radius')
    expect(dataTableCss).not.toContain('border-spacing')
  })
})
