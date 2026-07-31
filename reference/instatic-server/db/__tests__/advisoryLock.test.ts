import { describe, expect, it } from 'bun:test'
import { createSqliteClient } from '../sqlite'
import type { DbClient } from '../client'
import { releaseLeader, tryAcquireLeader, withSchedulerLeaderLock } from '../advisoryLock'

const LOCK_KEY = 123456
const PREFIX = '[test-scheduler]'

/**
 * Minimal DbClient stub that only honors the two advisory-lock statements the
 * module issues. `throwOnLock` simulates SQLite (the PG function is absent).
 */
function makeFakeDb(opts: { got?: boolean; throwOnLock?: boolean }): DbClient & { calls: string[] } {
  const calls: string[] = []
  const db = (async (strings: TemplateStringsArray) => {
    const sql = strings.join('?')
    calls.push(sql)
    if (sql.includes('pg_try_advisory_lock')) {
      if (opts.throwOnLock) throw new Error('no such function: pg_try_advisory_lock')
      return { rows: [{ got: opts.got }], rowCount: 1 }
    }
    if (sql.includes('pg_advisory_unlock')) {
      return { rows: [{ unlocked: true }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  }) as unknown as DbClient & { calls: string[] }
  db.calls = calls
  return db
}

describe('tryAcquireLeader', () => {
  it('returns the pg token when the advisory lock is acquired', async () => {
    const db = makeFakeDb({ got: true })
    expect(await tryAcquireLeader(db, LOCK_KEY)).toBe('pg-advisory')
  })

  it('returns null when another instance holds the lock', async () => {
    const db = makeFakeDb({ got: false })
    expect(await tryAcquireLeader(db, LOCK_KEY)).toBeNull()
  })

  it('falls through to the sqlite sentinel when the PG function is absent', async () => {
    const db = makeFakeDb({ throwOnLock: true })
    expect(await tryAcquireLeader(db, LOCK_KEY)).toBe('sqlite-leader')
  })
})

describe('releaseLeader', () => {
  it('issues pg_advisory_unlock for a pg token', async () => {
    const db = makeFakeDb({ got: true })
    await releaseLeader(db, 'pg-advisory', LOCK_KEY, PREFIX)
    expect(db.calls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true)
  })

  it('is a no-op for the sqlite sentinel', async () => {
    const db = makeFakeDb({ throwOnLock: true })
    await releaseLeader(db, 'sqlite-leader', LOCK_KEY, PREFIX)
    expect(db.calls.length).toBe(0)
  })

  it('is a no-op for a null (non-leader) token', async () => {
    const db = makeFakeDb({ got: false })
    await releaseLeader(db, null, LOCK_KEY, PREFIX)
    expect(db.calls.length).toBe(0)
  })
})

describe('withSchedulerLeaderLock', () => {
  it('runs the body and releases when it wins leadership', async () => {
    const db = makeFakeDb({ got: true })
    let ran = false
    const result = await withSchedulerLeaderLock(db, LOCK_KEY, PREFIX, async () => {
      ran = true
      return 'done'
    })
    expect(ran).toBe(true)
    expect(result).toBe('done')
    expect(db.calls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true)
  })

  it('skips the body and returns undefined when another instance is leader', async () => {
    const db = makeFakeDb({ got: false })
    let ran = false
    const result = await withSchedulerLeaderLock(db, LOCK_KEY, PREFIX, async () => {
      ran = true
      return 'done'
    })
    expect(ran).toBe(false)
    expect(result).toBeUndefined()
    expect(db.calls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(false)
  })

  it('releases the lock even when the body throws', async () => {
    const db = makeFakeDb({ got: true })
    await expect(
      withSchedulerLeaderLock(db, LOCK_KEY, PREFIX, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(db.calls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true)
  })
})

describe('SQLite fallthrough (real client)', () => {
  it('always returns a usable leader token and runs the body', async () => {
    const db = createSqliteClient(':memory:')
    const token = await tryAcquireLeader(db, LOCK_KEY)
    expect(token).toBe('sqlite-leader')
    // Releasing the sentinel must not throw against a real sqlite client.
    await releaseLeader(db, token, LOCK_KEY, PREFIX)

    let ran = false
    const result = await withSchedulerLeaderLock(db, LOCK_KEY, PREFIX, async () => {
      ran = true
      return 42
    })
    expect(ran).toBe(true)
    expect(result).toBe(42)
  })
})
