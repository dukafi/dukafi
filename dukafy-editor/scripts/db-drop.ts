/**
 * Development-only database + uploads reset.
 *
 * `bun run db:drop` wipes local state so you can start from a clean slate:
 *
 *   - SQLite (default): deletes the database file and its `-wal` / `-shm` /
 *     `-journal` sidecar files (e.g. ./.tmp/dev.db*).
 *   - Postgres: drops and recreates the `public` schema, removing every table.
 *   - Uploads: empties the uploads directory (media, fonts, published static
 *     artefacts) but keeps the directory itself.
 *
 * Paths come from the same env vars the server boots with
 * (DATABASE_URL, UPLOADS_DIR) via readServerConfig, so this always targets
 * whatever database the local dev server is actually using.
 *
 * The next `bun run dev` re-runs migrations and recreates the database from
 * scratch.
 *
 * This is destructive and intentionally local-only — never run it against a
 * database you care about. Pass `-y` / `--yes` to skip the confirmation
 * prompt (useful for scripting).
 */

import { SQL } from 'bun'
import { readdir, rm, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isSqliteUrl, parseSqlitePath } from '../server/db'
import { readServerConfig } from '../server/config'

function log(msg: string): void {
  console.error(`[db:drop] ${msg}`)
}

function fail(msg: string): never {
  log(msg)
  process.exit(1)
}

const skipPrompt = process.argv.slice(2).some((arg) => arg === '-y' || arg === '--yes' || arg === '--force')

const config = readServerConfig()
const { databaseUrl, uploadsDir } = config

// --- confirmation ----------------------------------------------------------

if (!skipPrompt) {
  log('This will PERMANENTLY delete:')
  log(`  • database: ${databaseUrl}`)
  log(`  • uploads:  ${resolve(uploadsDir)}`)
  const answer = prompt('[db:drop] Type "y" to continue:')
  if (answer?.trim().toLowerCase() !== 'y') {
    fail('Aborted — nothing was deleted.')
  }
}

// --- database --------------------------------------------------------------

async function dropSqlite(): Promise<void> {
  const dbPath = parseSqlitePath(databaseUrl)
  const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]
  let removed = 0
  for (const target of targets) {
    if (await Bun.file(target).exists()) {
      await rm(target, { force: true })
      removed += 1
      log(`Removed ${target}`)
    }
  }
  if (removed === 0) {
    log(`No SQLite files found at ${dbPath} — already clean.`)
  }
}

async function dropPostgres(): Promise<void> {
  // Reset the schema rather than dropping the whole database — the connection
  // role keeps its rights and the next migration run rebuilds every table.
  const sql = new SQL(databaseUrl)
  try {
    await sql.unsafe('drop schema if exists public cascade')
    await sql.unsafe('create schema public')
    log('Dropped and recreated the public schema.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    fail(
      `Could not reach Postgres at ${databaseUrl}: ${message}\n` +
        '         Is the database running? For the dockerised dev DB, start it with `bun run dev` first.',
    )
  } finally {
    await sql.close()
  }
}

if (isSqliteUrl(databaseUrl)) {
  await dropSqlite()
} else {
  await dropPostgres()
}

// --- uploads ---------------------------------------------------------------

async function clearUploads(): Promise<void> {
  const dir = resolve(uploadsDir)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(dir, { recursive: true })
      log(`Uploads directory did not exist — created empty ${dir}.`)
      return
    }
    throw err
  }

  if (entries.length === 0) {
    log(`Uploads directory already empty (${dir}).`)
    return
  }

  for (const entry of entries) {
    await rm(join(dir, entry), { recursive: true, force: true })
  }
  log(`Cleared ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${dir}.`)
}

await clearUploads()

log('Done. Run `bun run dev` to recreate the database from migrations.')
