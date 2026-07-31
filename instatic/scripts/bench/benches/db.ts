/**
 * Database benchmark.
 *
 * Exercises the SQLite client against an isolated DB seeded with the
 * baseline migrations. Measures the storage layer with realistic row
 * counts so we know whether the data layer can keep up at "real CMS"
 * scale (hundreds to tens of thousands of rows).
 *
 * Scenarios:
 *   - Migration cold-run cost (drops + recreates the schema)
 *   - Single-row inserts at varying batch sizes
 *   - Batched inserts inside an explicit transaction
 *   - Listing rows from a populated `data_rows`
 *   - JSON column round-trip (`cells_json`) — proves the auto-stringify /
 *     auto-parse layer doesn't dominate cost.
 *   - Indexed lookup vs sequential scan
 */
import { resolve } from 'node:path'
import { mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import type { BenchModule, BenchResult, BenchRow, BenchContext } from '../lib/types'
import { summarize, fmtMs, fmtNum } from '../lib/stats'
import { log } from '../lib/log'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

async function loadDb() {
  const { createSqliteClient } = await import('../../../server/db/sqlite')
  const { runMigrations } = await import('../../../server/db/runMigrations')
  const { sqliteMigrations } = await import('../../../server/db/migrations-sqlite')
  return { createSqliteClient, runMigrations, sqliteMigrations }
}

async function freshDb(label: string): Promise<{ db: ReturnType<Awaited<ReturnType<typeof loadDb>>['createSqliteClient']>; path: string; migrateMs: number }> {
  const benchDir = resolve(REPO_ROOT, '.tmp/benchmarks')
  mkdirSync(benchDir, { recursive: true })
  const path = resolve(benchDir, `db-bench-${label}-${Date.now()}.db`)
  if (existsSync(path)) unlinkSync(path)
  const { createSqliteClient, runMigrations, sqliteMigrations } = await loadDb()
  const db = createSqliteClient(path)
  const t0 = performance.now()
  await runMigrations(db, sqliteMigrations)
  return { db, path, migrateMs: performance.now() - t0 }
}

export const dbBench: BenchModule = {
  name: 'db',
  title: 'Database (SQLite) performance',
  description: 'Migrations, single-row inserts, batched writes, JSON columns, and scan vs index lookup.',

  async run(ctx: BenchContext): Promise<BenchResult> {
    log.step('Spinning up an isolated DB with full migrations')
    const { db: _db, path, migrateMs } = await freshDb('warm')

    try {
      const migrationsRow: BenchRow[] = [
        {
          label: 'Cold migrations',
          metrics: { wall: fmtMs(migrateMs) },
          notes: 'Drops + recreates the schema from migrations-sqlite.ts.',
        },
      ]

      // Need the pages table id (it's a system table seeded by migrations).
      const pagesTableId = 'pages'

      // ---- Single-row inserts ------------------------------------------
      log.step('Single-row inserts')
      const insertRowCounts = ctx.quick ? [100, 1_000] : [100, 1_000, 10_000]
      const insertRows: BenchRow[] = []
      for (const n of insertRowCounts) {
        // Fresh DB per scenario keeps row counts comparable
        const fresh = await freshDb(`ins-${n}`)
        try {
          const t0 = performance.now()
          for (let i = 0; i < n; i++) {
            await fresh.db`
              insert into data_rows (id, table_id, cells_json, slug, status, created_at, updated_at)
              values (${`row-${i}`}, ${pagesTableId}, ${{ title: `Page ${i}`, slug: `page-${i}` }}, ${`page-${i}`}, 'draft', current_timestamp, current_timestamp)
            `
          }
          const wallMs = performance.now() - t0
          insertRows.push({
            label: `${fmtNum(n)} rows, one-at-a-time`,
            inputs: { rows: n },
            metrics: {
              total: fmtMs(wallMs),
              per_row: fmtMs(wallMs / n),
              throughput: `${fmtNum(Math.floor((n / wallMs) * 1000))} rows/s`,
            },
          })
        } finally {
          unlinkSync(fresh.path)
        }
      }

      // ---- List rows ---------------------------------------------------
      log.step('List queries on populated table')
      const listRows: BenchRow[] = []
      {
        const POPULATE = ctx.quick ? 1_000 : 10_000
        const fresh = await freshDb('list')
        try {
          for (let i = 0; i < POPULATE; i++) {
            await fresh.db`
              insert into data_rows (id, table_id, cells_json, slug, status, created_at, updated_at)
              values (${`row-${i}`}, ${pagesTableId}, ${{ title: `Page ${i}`, slug: `page-${i}`, body: { text: 'Lorem ipsum dolor sit amet '.repeat(20) } }}, ${`page-${i}`}, 'draft', current_timestamp, current_timestamp)
            `
          }
          const queryShapes: Array<{ label: string; run: () => Promise<{ rowCount: number }> }> = [
            {
              label: `select COUNT(*) from ${fmtNum(POPULATE)} rows`,
              run: async () => {
                const { rows } = await fresh.db<{ n: number }>`select count(*) as n from data_rows`
                return { rowCount: rows[0].n }
              },
            },
            {
              label: 'select * limit 50',
              run: async () => {
                const { rows } = await fresh.db<{ id: string }>`select id, slug, cells_json from data_rows order by created_at desc limit 50`
                return { rowCount: rows.length }
              },
            },
            {
              label: 'select * where slug = ? (indexed lookup)',
              run: async () => {
                const target = `page-${Math.floor(POPULATE / 2)}`
                const { rows } = await fresh.db<{ id: string }>`select id from data_rows where slug = ${target}`
                return { rowCount: rows.length }
              },
            },
            {
              label: 'select * where cells_json LIKE %k% (sequential scan)',
              run: async () => {
                const { rows } = await fresh.db<{ id: string }>`select id from data_rows where cells_json like ${'%page-9%'} limit 50`
                return { rowCount: rows.length }
              },
            },
          ]
          for (const shape of queryShapes) {
            const iters = ctx.quick ? 20 : 50
            for (let i = 0; i < 3; i++) await shape.run() // warmup
            const samples: number[] = []
            for (let i = 0; i < iters; i++) {
              const t0 = performance.now()
              await shape.run()
              samples.push(performance.now() - t0)
            }
            const s = summarize(samples)
            listRows.push({
              label: shape.label,
              inputs: { table_rows: POPULATE, iters },
              metrics: {
                mean: fmtMs(s.mean),
                p95: fmtMs(s.p95),
                p99: fmtMs(s.p99),
                throughput: `${fmtNum(Math.floor(1000 / s.mean))} queries/s`,
              },
            })
          }
        } finally {
          unlinkSync(fresh.path)
        }
      }

      // ---- JSON round-trip ---------------------------------------------
      log.step('JSON column round-trip')
      const jsonRows: BenchRow[] = []
      {
        const SHAPES = [
          { label: 'small (5 fields)', shape: { a: 1, b: 'two', c: true, d: [1, 2, 3], e: { nested: 'value' } } },
          {
            label: 'medium (100 nodes)',
            shape: {
              nodes: Object.fromEntries(
                Array.from({ length: 100 }, (_, i) => [`n${i}`, { moduleId: 'base.text', props: { text: `n${i}` }, children: [], classIds: [] }]),
              ),
              rootNodeId: 'n0',
            },
          },
          {
            label: 'large (1k nodes)',
            shape: {
              nodes: Object.fromEntries(
                Array.from({ length: 1000 }, (_, i) => [`n${i}`, { moduleId: 'base.text', props: { text: `n${i}` }, children: [], classIds: [] }]),
              ),
              rootNodeId: 'n0',
            },
          },
        ]
        for (const { label, shape } of SHAPES) {
          const fresh = await freshDb(`json-${label}`)
          try {
            const iters = ctx.quick ? 100 : 500
            const samples: number[] = []
            for (let i = 0; i < iters; i++) {
              const id = `j-${i}`
              const t0 = performance.now()
              await fresh.db`
                insert into data_rows (id, table_id, cells_json, slug, status, created_at, updated_at)
                values (${id}, ${pagesTableId}, ${shape}, ${id}, 'draft', current_timestamp, current_timestamp)
              `
              const { rows } = await fresh.db<{ cells_json: unknown }>`select cells_json from data_rows where id = ${id}`
              if (rows.length === 0) throw new Error('round-trip missed')
              samples.push(performance.now() - t0)
            }
            const s = summarize(samples)
            const payloadBytes = JSON.stringify(shape).length
            jsonRows.push({
              label,
              inputs: { payload_bytes: payloadBytes, iters },
              metrics: {
                mean_roundtrip: fmtMs(s.mean),
                p95: fmtMs(s.p95),
                throughput: `${fmtNum(Math.floor(1000 / s.mean))} roundtrips/s`,
              },
            })
          } finally {
            unlinkSync(fresh.path)
          }
        }
      }

      const inserts1k = insertRows.find((r) => r.label.startsWith('1,000'))
      const listSelect50 = listRows.find((r) => r.label.startsWith('select * limit 50'))

      return {
        name: this.name,
        title: this.title,
        headline: {
          'cold migrations': fmtMs(migrateMs),
          '1k inserts (per row)': inserts1k?.metrics.per_row ?? '—',
          'select 50 (mean)': listSelect50?.metrics.mean ?? '—',
        },
        sections: [
          { title: 'Migrations', rows: migrationsRow },
          { title: 'Single-row inserts', intro: 'No transaction wrapper — each insert is its own commit. This is the "naïve write path" floor.', rows: insertRows },
          { title: 'Query shapes on a populated table', intro: 'Indexed lookups vs. sequential JSON scans on a `data_rows` table with realistic row counts.', rows: listRows },
          { title: 'JSON column round-trip', intro: 'Insert + readback of a `cells_json` payload. Tests the SQLite adapter\'s auto-stringify / auto-parse layer.', rows: jsonRows },
        ],
      }
    } finally {
      try {
        unlinkSync(path)
      } catch {
        // best-effort cleanup
      }
    }
  },
}
