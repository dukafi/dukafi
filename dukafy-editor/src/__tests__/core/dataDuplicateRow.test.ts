import { describe, expect, it } from 'bun:test'
import { buildDuplicateRowCells } from '@core/data/duplicateRow'
import type { DataRow, DataTable } from '@core/data/schemas'

const now = '2026-06-01T10:00:00.000Z'

function makeTable(overrides: Partial<DataTable> = {}): DataTable {
  return {
    id: 'posts',
    name: 'posts',
    slug: 'posts',
    kind: 'postType',
    singularLabel: 'Post',
    pluralLabel: 'Posts',
    routeBase: '/posts',
    primaryFieldId: 'title',
    fields: [
      { type: 'text', id: 'title', label: 'Title', required: true },
      { type: 'text', id: 'slug', label: 'Slug', required: true },
      { type: 'richText', id: 'body', label: 'Body' },
    ],
    system: false,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeRow(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: 'row-source',
    tableId: 'posts',
    cells: { title: 'Launch notes', slug: 'launch-notes', body: 'Body copy' },
    slug: 'launch-notes',
    status: 'published',
    authorUserId: null,
    createdByUserId: null,
    updatedByUserId: null,
    publishedByUserId: null,
    author: null,
    createdBy: null,
    updatedBy: null,
    publishedBy: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    scheduledPublishAt: null,
    deletedAt: null,
    ...overrides,
  }
}

describe('buildDuplicateRowCells', () => {
  it('copies cells while generating a copy title and unique slug for routable rows', () => {
    const table = makeTable()
    const source = makeRow()
    const existing = [
      source,
      makeRow({ id: 'row-copy', slug: 'launch-notes-copy', cells: { title: 'Existing', slug: 'launch-notes-copy' } }),
    ]

    expect(buildDuplicateRowCells(table, source, existing)).toEqual({
      title: 'Launch notes (copy)',
      slug: 'launch-notes-copy-2',
      body: 'Body copy',
    })
  })

  it('does not invent a slug for non-routable data tables', () => {
    const table = makeTable({
      id: 'contact-submissions',
      name: 'contact-submissions',
      slug: 'contact-submissions',
      kind: 'data',
      singularLabel: 'Submission',
      pluralLabel: 'Submissions',
      routeBase: '',
      fields: [
        { type: 'text', id: 'name', label: 'Name' },
        { type: 'email', id: 'email', label: 'Email' },
      ],
      primaryFieldId: 'name',
    })
    const source = makeRow({
      tableId: 'contact-submissions',
      cells: { name: 'Ada Lovelace', email: 'ada@example.com' },
      slug: '',
    })

    expect(buildDuplicateRowCells(table, source, [source])).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })
})
