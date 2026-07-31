import { describe, expect, it, beforeEach } from 'bun:test'
import { createSqliteClient } from '../../db/sqlite'
import { sqliteMigrations } from '../../db/migrations-sqlite'
import { runMigrations } from '../../db/runMigrations'
import type { DbClient, DbResult } from '../../db/client'
import { createUser, updateUser } from '../users'

async function freshDb(): Promise<DbClient> {
  const db = createSqliteClient(':memory:')
  await runMigrations(db, sqliteMigrations)
  return db
}

/**
 * Wrap a DbClient and record the SQL of every tagged-template call (the
 * INSERT/UPDATE write paths) so a test can assert the write carries no dead
 * `returning` clause.
 */
function spyTagged(db: DbClient): { spy: DbClient; taggedSqls: string[] } {
  const taggedSqls: string[] = []
  const base = (strings: TemplateStringsArray, ...values: unknown[]) => {
    taggedSqls.push(strings.join(' ? '))
    return db(strings, ...values)
  }
  const spy = Object.assign(base, {
    unsafe: <Row>(sql: string, params?: unknown[]): Promise<DbResult<Row>> => db.unsafe<Row>(sql, params),
    transaction: <T>(fn: (tx: DbClient) => Promise<T>) => db.transaction(fn),
    dialect: db.dialect,
  }) as unknown as DbClient
  return { spy, taggedSqls }
}

describe('user create/update — no dead RETURNING, correct hydration', () => {
  let db: DbClient

  beforeEach(async () => {
    db = await freshDb()
  })

  it('createUser returns the fully hydrated user without a returning clause', async () => {
    const { spy, taggedSqls } = spyTagged(db)
    const user = await createUser(spy, {
      email: 'Alice@Example.com',
      displayName: 'Alice',
      passwordHash: 'hash-1',
      roleId: 'admin',
    })

    expect(user.email).toBe('Alice@Example.com')
    expect(user.displayName).toBe('Alice')
    expect(user.role.slug).toBe('admin')
    expect(user.role.name).toBe('Admin')
    expect(user.capabilities.length).toBeGreaterThan(0)
    expect(user.gravatarHash).toMatch(/^[0-9a-f]{64}$/)

    const insertSql = taggedSqls.find((sql) => sql.includes('insert into users'))
    expect(insertSql).toBeDefined()
    expect(insertSql!.toLowerCase()).not.toContain('returning')
  })

  it('updateUser returns the fully hydrated user without a returning clause', async () => {
    const created = await createUser(db, {
      email: 'bob@example.com',
      displayName: 'Bob',
      passwordHash: 'hash-2',
      roleId: 'admin',
    })

    const { spy, taggedSqls } = spyTagged(db)
    const updated = await updateUser(spy, created.id, {
      displayName: 'Bob Renamed',
      roleId: 'client',
    })

    expect(updated).not.toBeNull()
    expect(updated!.displayName).toBe('Bob Renamed')
    expect(updated!.role.slug).toBe('client')
    expect(updated!.role.name).toBe('Client')
    expect(updated!.email).toBe('bob@example.com')

    const updateSql = taggedSqls.find((sql) => sql.includes('update users'))
    expect(updateSql).toBeDefined()
    expect(updateSql!.toLowerCase()).not.toContain('returning')
  })

  it('updateUser returns null for a missing user', async () => {
    const result = await updateUser(db, 'does-not-exist', { displayName: 'Nope' })
    expect(result).toBeNull()
  })
})
