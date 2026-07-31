/**
 * Shared version-number allocation for `data_row_versions`.
 *
 * Every new version of a data row — whether written by the per-row publish
 * path (`data/publish.ts`) or the whole-site publish pipeline
 * (`repositories/publish.ts`) — allocates its `version_number` through this
 * single function so the "next = max(existing) + 1" invariant has one home.
 */

import type { DbClient } from '../../db/client'

/**
 * Next `version_number` for a row: `max(existing) + 1`, or `1` when the row has
 * no versions yet. Dialect-naive ANSI SQL — `coalesce` + `max`, no Postgres-isms.
 */
export async function nextDataRowVersionNumber(db: DbClient, rowId: string): Promise<number> {
  const { rows } = await db<{ next_version: number }>`
    select coalesce(max(version_number), 0) + 1 as next_version
    from data_row_versions
    where row_id = ${rowId}
  `
  return Number(rows[0]?.next_version ?? 1)
}
