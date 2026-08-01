import { describe, expect, it } from 'bun:test'
import type { DbClient, DbResult } from '../../../server/db'
import {
  getPublishedRuntimeAsset,
  savePublishedRuntimeAssets,
} from '../../../server/repositories/runtimeAsset'

function makeFakeDb() {
  const rows: Record<string, unknown>[] = []

  const handle = async <Row extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbResult<Row>> => {
    // Reconstruct a parameterized SQL string for pattern matching.
    const sql = strings.reduce<string>((acc, str, i) => (i === 0 ? str : `${acc}$${i}${str}`), '')
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    // savePublishedRuntimeAssets — values: [id, pageVersionId, path, publicPath, contentType, bytes]
    if (normalized.includes('insert into published_runtime_assets')) {
      rows.push({
        id: values[0],
        page_version_id: values[1],
        asset_path: values[2],
        public_path: values[3],
        content_type: values[4],
        content_bytes: values[5],
      })
      return { rows: [], rowCount: 1 }
    }
    // getPublishedRuntimeAsset — values[0] = publicPath
    if (normalized.includes('select public_path, content_type, content_bytes')) {
      const row = rows.find((candidate) => candidate.public_path === values[0])
      return { rows: row ? [row as Row] : [], rowCount: row ? 1 : 0 }
    }
    throw new Error(`Unhandled SQL: ${sql}`)
  }

  handle.transaction = async <T>(cb: (tx: DbClient) => Promise<T>): Promise<T> =>
    cb(handle as unknown as DbClient)

  return Object.assign(handle as DbClient, { rows })
}

describe('published runtime asset repository', () => {
  it('stores and reads immutable runtime assets by public path', async () => {
    const db = makeFakeDb()
    await savePublishedRuntimeAssets(db, 'version_1', [
      {
        path: 'entries/entry.js',
        publicPath: '/_instatic/assets/version_1/entries/entry.js',
        content: 'console.log("ok")',
        bytes: new TextEncoder().encode('console.log("ok")'),
        contentType: 'text/javascript; charset=utf-8',
      },
    ])

    const asset = await getPublishedRuntimeAsset(db, '/_instatic/assets/version_1/entries/entry.js')

    expect(asset).toMatchObject({
      publicPath: '/_instatic/assets/version_1/entries/entry.js',
      contentType: 'text/javascript; charset=utf-8',
    })
    expect(new TextDecoder().decode(asset?.bytes)).toBe('console.log("ok")')
  })
})
