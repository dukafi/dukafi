import { describe, expect, it, beforeEach } from 'bun:test'
import { createSqliteClient } from '../../db/sqlite'
import { sqliteMigrations } from '../../db/migrations-sqlite'
import { runMigrations } from '../../db/runMigrations'
import type { DbClient, DbResult } from '../../db/client'
import { createMediaAsset, assignAssetToFolders, listMediaAssets } from '../media'

async function freshDb(): Promise<DbClient> {
  const db = createSqliteClient(':memory:')
  await runMigrations(db, sqliteMigrations)
  return db
}

/**
 * Wrap a DbClient and record the raw SQL of every `db.unsafe()` call so a test
 * can assert how many queries a read issues against a given table.
 */
function spyUnsafe(db: DbClient): { spy: DbClient; unsafeSqls: string[] } {
  const unsafeSqls: string[] = []
  const base = (strings: TemplateStringsArray, ...values: unknown[]) => db(strings, ...values)
  const spy = Object.assign(base, {
    unsafe: <Row>(sql: string, params?: unknown[]): Promise<DbResult<Row>> => {
      unsafeSqls.push(sql)
      return db.unsafe<Row>(sql, params)
    },
    transaction: <T>(fn: (tx: DbClient) => Promise<T>) => db.transaction(fn),
    dialect: db.dialect,
  }) as unknown as DbClient
  return { spy, unsafeSqls }
}

async function seedAsset(db: DbClient, id: string): Promise<void> {
  await createMediaAsset(db, {
    id,
    filename: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: 10,
    storagePath: `${id}.png`,
    publicPath: `/uploads/${id}.png`,
    uploadedByUserId: null,
    storageAdapterId: '',
    externallyHosted: false,
  })
}

async function seedFolder(db: DbClient, id: string): Promise<void> {
  await db`insert into media_folders (id, name, slug) values (${id}, ${id}, ${id})`
}

describe('loadFolderIdsForAssets — single grouped read (N+1 fix)', () => {
  let db: DbClient

  beforeEach(async () => {
    db = await freshDb()
  })

  it('issues exactly ONE media_asset_folders query for N assets and groups correctly', async () => {
    await seedAsset(db, 'a1')
    await seedAsset(db, 'a2')
    await seedAsset(db, 'a3')
    await seedFolder(db, 'f1')
    await seedFolder(db, 'f2')

    await assignAssetToFolders(db, 'a1', { add: ['f1', 'f2'] })
    await assignAssetToFolders(db, 'a2', { add: ['f1'] })
    // a3 intentionally has no folder memberships.

    const { spy, unsafeSqls } = spyUnsafe(db)
    const assets = await listMediaAssets(spy)

    // One — and only one — query touches media_asset_folders for the whole batch.
    const folderQueries = unsafeSqls.filter((sql) => sql.includes('media_asset_folders'))
    expect(folderQueries.length).toBe(1)
    // And that query is the batched IN-list, not a per-id equality lookup.
    expect(folderQueries[0]).toContain(' in (')

    const byId = new Map(assets.map((asset) => [asset.id, asset.folderIds.slice().sort()]))
    expect(byId.get('a1')).toEqual(['f1', 'f2'])
    expect(byId.get('a2')).toEqual(['f1'])
    expect(byId.get('a3')).toEqual([])
  })
})
