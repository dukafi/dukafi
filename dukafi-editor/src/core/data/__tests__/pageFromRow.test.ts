import { describe, expect, it } from 'bun:test'
import { pageFromRow, pageToCells } from '../pageFromRow'
import type { DataRow } from '@core/data/schemas'

const baseRow = (cells: Record<string, unknown>): DataRow => ({
  id: 'p1', tableId: 'pages', slug: 'posts-template', cells: cells as never,
  authorUserId: null, createdByUserId: null, updatedByUserId: null,
} as unknown as DataRow)

describe('pageFromRow template target', () => {
  it('reads a postTypes target round-trip', () => {
    const page = pageFromRow(baseRow({
      title: 'T', slug: 'posts-template',
      templateEnabled: true,
      templateTarget: { kind: 'postTypes', tableSlugs: ['posts'] },
      templatePriority: 10,
    }))
    expect(page.template).toEqual({
      enabled: true, target: { kind: 'postTypes', tableSlugs: ['posts'] }, priority: 10,
    })
    const cells = pageToCells(page)
    expect(cells.templateTarget).toEqual({ kind: 'postTypes', tableSlugs: ['posts'] })
    expect(cells.templateContext).toBeUndefined()
    expect(cells.templateConditions).toBeUndefined()
  })

  it('drops a malformed target', () => {
    const page = pageFromRow(baseRow({ templateEnabled: true, templateTarget: { kind: 'nonsense' } }))
    expect(page.template).toBeUndefined()
  })
})
