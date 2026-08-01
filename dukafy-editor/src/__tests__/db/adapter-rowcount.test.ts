import { describe, test, expect } from 'bun:test'
import { createTestDb } from '../helpers/createTestDb'

/**
 * Cross-dialect contract: `rowCount` must report the number of *affected*
 * rows for non-RETURNING writes (UPDATE / DELETE / INSERT) and the number of
 * *returned* rows for SELECT / RETURNING — identically on SQLite and Postgres.
 *
 * Regression guard for ISS-023: the Postgres adapter previously returned
 * `rows.length` (always 0 for a non-RETURNING write), so every repository that
 * branches on `result.rowCount` (session revocation, schedule claiming, user
 * mutations, deletes) silently reported failure on a Postgres install.
 *
 * Runs against SQLite by default; set `DB=postgres TEST_POSTGRES_URL=…` to
 * exercise the Postgres adapter (where this test fails without the fix).
 */
describe('DB adapter rowCount', () => {
  test('reports affected-row count for non-RETURNING writes', async () => {
    const { db, cleanup } = await createTestDb()
    try {
      await db`create table rc_probe (id integer primary key, n integer)`
      await db`insert into rc_probe (id, n) values (1, 1), (2, 2), (3, 3)`

      const noMatch = await db`update rc_probe set n = n + 1 where id = 999`
      expect(noMatch.rowCount).toBe(0)

      const oneMatch = await db`update rc_probe set n = n + 1 where id = 1`
      expect(oneMatch.rowCount).toBe(1)

      const deleted = await db`delete from rc_probe where id <= 2`
      expect(deleted.rowCount).toBe(2)

      const inserted = await db`insert into rc_probe (id, n) values (10, 10), (11, 11)`
      expect(inserted.rowCount).toBe(2)

      const selected = await db<{ id: number }>`select id from rc_probe order by id`
      expect(selected.rowCount).toBe(selected.rows.length)
    } finally {
      await cleanup()
    }
  })
})
