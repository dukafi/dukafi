/**
 * recentStore — last 8 deduped command IDs in localStorage.
 *
 * TypeBox validates the read so corrupted data doesn't brick the UI.
 * Validates with parseJsonWithFallback per CLAUDE.md boundary rules.
 */

import { Type } from '@sinclair/typebox'
import { parseJsonWithFallback } from '@core/utils/jsonValidate'
import type { CommandId } from './types'

const STORAGE_KEY = 'spotlight:recent-commands'
const MAX_RECENT = 8

// TypeBox schema — array of strings (command IDs)
const RecentSchema = Type.Array(Type.String(), { maxItems: 20 })

/**
 * Read the recent command list from localStorage.
 * Falls back to [] on any parse/validation error.
 */
export function readRecentCommands(): CommandId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return parseJsonWithFallback(raw, RecentSchema, [])
  } catch {
    // localStorage may throw in restricted environments (private browsing).
    return []
  }
}

/**
 * Prepend a command to the recent list.
 * Deduplicates: the command moves to the top if already present.
 * Caps at MAX_RECENT entries.
 */
export function recordRecentCommand(commandId: CommandId): void {
  try {
    const existing = readRecentCommands()
    const deduped = [commandId, ...existing.filter((id) => id !== commandId)]
    const trimmed = deduped.slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore write failures (quota exceeded, restricted env, etc.)
  }
}

/**
 * Clear the recent list (used in tests / settings).
 */
export function clearRecentCommands(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}
