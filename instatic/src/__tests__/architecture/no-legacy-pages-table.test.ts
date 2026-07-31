/**
 * Architecture Gate — No legacy `pages` / `page_versions` tables
 *
 * Pages and Visual Components are now stored in `data_tables` / `data_rows`.
 * The legacy `pages` and `page_versions` tables have been removed from the
 * baseline migration and must not be re-introduced.
 *
 * This gate enforces two things:
 *
 *   1. Neither migration file contains `create table pages` or
 *      `create table page_versions` (case-insensitive). Guards against a
 *      regression where someone reintroduces the old tables.
 *
 *   2. No TypeScript file under `server/` (excluding the migration files)
 *      contains a SQL reference of the form `from pages` or
 *      `from page_versions`. Those are live SQL queries against tables that
 *      no longer exist and will fail at runtime.
 *
 * Note: part 2 will fail until Step 3 of the unified-content-storage refactor
 * rewires `server/repositories/site.ts`, `server/repositories/publish.ts`,
 * and `server/handlers/cms/setup.ts`. Those failures are expected and owned
 * by Step 3.
 *
 * @see server/db/migrations-pg.ts      — Postgres baseline
 * @see server/db/migrations-sqlite.ts  — SQLite baseline
 * @see docs/plans/2026-05-19-unified-content-storage.md
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'
import { pgMigrations } from '../../../server/db/migrations-pg'
import { sqliteMigrations } from '../../../server/db/migrations-sqlite'

const PROJECT_ROOT = join(import.meta.dir, '../../../')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (extname(entry) === '.ts') out.push(full)
  }
  return out
}

/**
 * Returns true if the SQL string contains `create table pages` or
 * `create table page_versions` (case-insensitive, allowing arbitrary
 * whitespace between the words).
 */
function hasLegacyTableDDL(sql: string): boolean {
  const normalised = sql.replace(/\s+/g, ' ').toLowerCase()
  return (
    normalised.includes('create table pages') ||
    normalised.includes('create table page_versions') ||
    normalised.includes('create table if not exists pages') ||
    normalised.includes('create table if not exists page_versions')
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('no-legacy-pages-table — pages and page_versions must not exist in the schema', () => {
  test('migrations-pg.ts 001_baseline does not create a `pages` table', () => {
    const baseline = pgMigrations.find((m) => m.id === '001_baseline')
    expect(baseline).toBeDefined()
    const found = hasLegacyTableDDL(baseline!.sql)
    if (found) {
      throw new Error(
        '[no-legacy-pages-table] migrations-pg.ts `001_baseline` still contains ' +
          '`create table pages` or `create table page_versions`. ' +
          'These tables have been replaced by data_tables/data_rows.',
      )
    }
    expect(found).toBe(false)
  })

  test('migrations-sqlite.ts 001_baseline does not create a `pages` table', () => {
    const baseline = sqliteMigrations.find((m) => m.id === '001_baseline')
    expect(baseline).toBeDefined()
    const found = hasLegacyTableDDL(baseline!.sql)
    if (found) {
      throw new Error(
        '[no-legacy-pages-table] migrations-sqlite.ts `001_baseline` still contains ' +
          '`create table pages` or `create table page_versions`. ' +
          'These tables have been replaced by data_tables/data_rows.',
      )
    }
    expect(found).toBe(false)
  })

  test('no later migration in either file recreates pages or page_versions', () => {
    const allSql = [
      ...pgMigrations.map((m) => m.sql),
      ...sqliteMigrations.map((m) => m.sql),
    ]
    const violations = allSql.filter(hasLegacyTableDDL)
    if (violations.length > 0) {
      throw new Error(
        `[no-legacy-pages-table] ${violations.length} migration(s) contain ` +
          '`create table pages` or `create table page_versions`. ' +
          'These tables no longer exist.',
      )
    }
    expect(violations).toHaveLength(0)
  })

  test('no server/ TypeScript file outside migrations references `from pages` or `from page_versions` in SQL', () => {
    const migrationFiles = new Set([
      join(PROJECT_ROOT, 'server/db/migrations-pg.ts'),
      join(PROJECT_ROOT, 'server/db/migrations-sqlite.ts'),
    ])

    const serverFiles = walk(join(PROJECT_ROOT, 'server')).filter(
      (f) => !migrationFiles.has(f),
    )

    // Pattern: SQL fragment `from pages` or `from page_versions`.
    // We strip JS comments first to avoid false-positives in JSDoc.
    const FROM_PAGES_RE = /\bfrom\s+page(?:s|_versions)\b/i

    const violations: string[] = []
    for (const file of serverFiles) {
      let content: string
      try {
        content = readFileSync(file, 'utf8')
      } catch {
        continue
      }

      // Strip line and block comments so pattern only matches live SQL.
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')

      if (FROM_PAGES_RE.test(stripped)) {
        violations.push(relative(PROJECT_ROOT, file))
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[no-legacy-pages-table] ${violations.length} server file(s) still reference ` +
          '`from pages` or `from page_versions` in SQL.\n' +
          'These tables no longer exist. Rewire the queries to use data_rows.\n\n' +
          'Files:\n' +
          violations.map((f) => `  ${f}`).join('\n') +
          '\n\n(Expected failures until Step 3 of the unified-content-storage refactor.)',
      )
    }

    expect(violations).toHaveLength(0)
  })
})
