/**
 * AI runtime boot hooks.
 *
 *   - `startConversationPurgeTick(db)` — registers a `setInterval` that
 *      hard-deletes soft-deleted conversations older than 30 days.
 *
 * Called from `server/index.ts` after migrations + system role sync.
 */

import type { DbClient } from '../db/client'
import { purgeSoftDeletedOlderThan } from './conversations/store'

const ONE_HOUR_MS = 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Conversation purge tick
// ---------------------------------------------------------------------------

let purgeTimer: ReturnType<typeof setInterval> | null = null

/**
 * Run the purge once immediately, then every hour. Safe to call repeatedly
 * — second-and-later calls are no-ops.
 *
 * Per-tick work is bounded: the DELETE walks only soft-deleted rows
 * (`ai_conv_deleted_idx` partial index). A backlog of weeks of soft-deleted
 * conversations would still finish well inside a single tick.
 */
export function startConversationPurgeTick(db: DbClient): void {
  if (purgeTimer) return
  // Fire-and-forget — never propagate the purge error to anyone.
  const runOnce = () => {
    runPurgeOnce(db).catch((err) => {
      console.error('[ai/boot] purge tick failed:', err)
    })
  }
  runOnce()
  purgeTimer = setInterval(runOnce, ONE_HOUR_MS)
}

async function runPurgeOnce(db: DbClient): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const count = await purgeSoftDeletedOlderThan(db, cutoff)
  if (count > 0) {
    console.log(`[ai/boot] Purged ${count} soft-deleted conversation(s) older than 30 days.`)
  }
}
