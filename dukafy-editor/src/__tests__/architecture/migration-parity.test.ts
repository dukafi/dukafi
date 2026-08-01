/**
 * Architecture Gate — Migration Parity (Postgres ↔ SQLite)
 *
 * The Postgres and SQLite migration files must remain in lockstep:
 *
 *   - Same number of migrations.
 *   - Same migration `id` values in the same order.
 *
 * Every migration added to `migrations-pg.ts` must have a corresponding entry
 * in `migrations-sqlite.ts` (translated to SQLite-compatible DDL/DML), and vice
 * versa. Divergence silently breaks the SQLite adapter — it will be missing
 * schema that Postgres has (or have schema Postgres doesn't), leading to runtime
 * errors in embedded or test environments.
 *
 * When you add a migration to one file:
 *   1. Add the dialect-translated equivalent to the other file at the same index.
 *   2. Keep the `id` field identical — it is the shared tracking key.
 *
 * SQLite dialect notes (see header of migrations-sqlite.ts):
 *   jsonb → text, timestamptz → text, bytea → blob, boolean → integer,
 *   now() → current_timestamp, distinct on → window function subquery,
 *   multi-ADD COLUMN → split into one ALTER TABLE per column.
 *
 * @see server/db/migrations-pg.ts     — Postgres dialect
 * @see server/db/migrations-sqlite.ts — SQLite dialect
 * @see server/db/runMigrations.ts     — migration runner (shared)
 */

import { describe, test, expect } from 'bun:test'
import { pgMigrations } from '../../../server/db/migrations-pg'
import { sqliteMigrations } from '../../../server/db/migrations-sqlite'

describe('Migration parity — migrations-pg.ts ↔ migrations-sqlite.ts', () => {
  test('PG and SQLite have the same number of migrations', () => {
    if (pgMigrations.length === sqliteMigrations.length) {
      expect(pgMigrations.length).toBe(sqliteMigrations.length)
      return
    }

    const more = pgMigrations.length > sqliteMigrations.length ? 'migrations-pg.ts' : 'migrations-sqlite.ts'
    const fewer = pgMigrations.length > sqliteMigrations.length ? 'migrations-sqlite.ts' : 'migrations-pg.ts'
    const diff = Math.abs(pgMigrations.length - sqliteMigrations.length)

    throw new Error(
      `[migration-parity] Migration count mismatch:\n` +
        `  migrations-pg.ts:     ${pgMigrations.length} migration(s)\n` +
        `  migrations-sqlite.ts: ${sqliteMigrations.length} migration(s)\n\n` +
        `${more} has ${diff} more migration(s) than ${fewer}.\n` +
        `Add the missing migration(s) (translated to the appropriate dialect) ` +
        `to ${fewer}.`,
    )
  })

  test('PG and SQLite have the same migration IDs in the same order', () => {
    const pgIds = pgMigrations.map((m) => m.id)
    const sqliteIds = sqliteMigrations.map((m) => m.id)

    // Compare up to the length of whichever list is shorter (length parity is
    // checked by the preceding test; here we report ID-level mismatches clearly).
    const maxLen = Math.max(pgIds.length, sqliteIds.length)
    const mismatches: Array<{ index: number; pgId: string; sqliteId: string }> = []

    for (let i = 0; i < maxLen; i++) {
      const pgId = pgIds[i] ?? '(missing)'
      const sqliteId = sqliteIds[i] ?? '(missing)'
      if (pgId !== sqliteId) {
        mismatches.push({ index: i, pgId, sqliteId })
      }
    }

    if (mismatches.length === 0) {
      expect(pgIds).toEqual(sqliteIds)
      return
    }

    const rows = mismatches.map(
      ({ index, pgId, sqliteId }) =>
        `  [${String(index).padStart(2)}]  pg:     ${pgId}\n` +
        `         sqlite: ${sqliteId}`,
    )

    throw new Error(
      `[migration-parity] ${mismatches.length} migration ID mismatch(es):\n\n` +
        rows.join('\n') +
        `\n\nFull ID lists:\n` +
        `  PG:     ${pgIds.join(', ')}\n` +
        `  SQLite: ${sqliteIds.join(', ')}`,
    )
  })
})
