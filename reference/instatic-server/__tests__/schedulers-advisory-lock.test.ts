import { beforeAll, describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSqliteClient } from '../db/sqlite'
import { sqliteMigrations } from '../db/migrations-sqlite'
import { runMigrations } from '../db/runMigrations'
import type { DbClient } from '../db/client'
import { tickPublishScheduler } from '../publish/publishScheduler'
import { tickPluginScheduler } from '../plugins/scheduler'

/**
 * Both scheduler tick loops must acquire/release leadership through the shared
 * `server/db/advisoryLock.ts` module — the HA-correctness primitive that stops
 * two instances double-firing. Two things are verified:
 *
 *   1. Behaviorally — each tick runs end-to-end against a real (migrated)
 *      SQLite client. SQLite has no `pg_try_advisory_lock`, so the shared
 *      module's fallthrough must return a usable token and let the body run.
 *
 *   2. At the source level — neither scheduler may re-implement the lock dance
 *      (that's the duplication we removed), and each must keep its own
 *      documented, distinct lock key unchanged.
 */
const SERVER_DIR = join(import.meta.dir, '..')

let db: DbClient

beforeAll(async () => {
  db = createSqliteClient(':memory:')
  await runMigrations(db, sqliteMigrations)
})

describe('schedulers run their tick body through the shared SQLite fallthrough', () => {
  it('publish scheduler tick completes (leadership won via fallthrough)', async () => {
    // No due rows seeded → the body runs over empty tables and returns cleanly.
    // A throw here would mean the shared lock failed to grant leadership.
    await expect(tickPublishScheduler(db)).resolves.toBeUndefined()
  })

  it('plugin scheduler tick completes (leadership won via fallthrough)', async () => {
    await expect(tickPluginScheduler(db)).resolves.toBeUndefined()
  })
})

describe('schedulers delegate leader election to the shared module', () => {
  it('publish scheduler imports the shared lock, owns no copy, keeps its key', async () => {
    const src = await readFile(join(SERVER_DIR, 'publish', 'publishScheduler.ts'), 'utf8')
    expect(src).toContain("from '../db/advisoryLock'")
    expect(src).toContain('withSchedulerLeaderLock')
    // The lock key must stay distinct + unchanged.
    expect(src).toContain('982410937')
    // No hand-rolled copy of the primitive may return.
    expect(src).not.toContain('pg_try_advisory_lock')
    expect(src).not.toContain('pg_advisory_unlock')
  })

  it('plugin scheduler imports the shared lock, owns no copy, keeps its key', async () => {
    const src = await readFile(join(SERVER_DIR, 'plugins', 'scheduler.ts'), 'utf8')
    expect(src).toContain("from '../db/advisoryLock'")
    expect(src).toContain('withSchedulerLeaderLock')
    expect(src).toContain('712830541')
    expect(src).not.toContain('pg_try_advisory_lock')
    expect(src).not.toContain('pg_advisory_unlock')
  })
})
