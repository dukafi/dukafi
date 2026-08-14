/**
 * spotlight/telemetry.ts — opt-in, local-only command-run counters.
 *
 * Default: disabled. A user preference (`spotlightTelemetryEnabled`,
 * default false) must be explicitly enabled by the user before any data
 * is written.
 *
 * Storage key: `spotlight:telemetry:v1`
 * Stores per-command run counts keyed by command id (strings only, no PII,
 * no args, no provider payloads).
 *
 * Capacity: top 200 commands by run count, LRU eviction for the rest.
 * The stored shape is a Map-like array of [id, count] pairs sorted descending
 * by count so reads are cheap.
 *
 * Reads are validated with TypeBox (`parseJsonWithFallback`) — corrupted data
 * falls back to an empty record without crashing the UI.
 */

import { Type, type Static } from '@sinclair/typebox'
import { parseJsonWithFallback } from '@core/utils/jsonValidate'
import { EDITOR_PREFS_KEY } from '@site/preferences/editorPreferences'

// ─── Storage key ──────────────────────────────────────────────────────────────

const TELEMETRY_KEY = 'spotlight:telemetry:v1'
const MAX_ENTRIES = 200

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Stored shape: array of [commandId, runCount] tuples, sorted descending by count.
 * Using a flat array (not an object) avoids key-collision edge cases with
 * arbitrary command ids and keeps the JSON compact.
 */
const TelemetryEntrySchema = Type.Tuple([Type.String(), Type.Number()])
const TelemetrySchema = Type.Array(TelemetryEntrySchema, { maxItems: MAX_ENTRIES + 50 })

type TelemetryEntry = Static<typeof TelemetryEntrySchema>
type TelemetryData = Static<typeof TelemetrySchema>

// ─── Preference read (non-React, lazy) ────────────────────────────────────────

const EditorPrefsSchema = Type.Object(
  { spotlightTelemetryEnabled: Type.Optional(Type.Boolean()) },
  { additionalProperties: true },
)

function isTelemetryEnabled(): boolean {
  try {
    const raw = localStorage.getItem(EDITOR_PREFS_KEY)
    const prefs = parseJsonWithFallback(raw, EditorPrefsSchema, {})
    return prefs.spotlightTelemetryEnabled === true
  } catch {
    return false
  }
}

// ─── Read / write helpers ─────────────────────────────────────────────────────

function readTelemetry(): TelemetryData {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY)
    return parseJsonWithFallback(raw, TelemetrySchema, [])
  } catch {
    return []
  }
}

function writeTelemetry(data: TelemetryData): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(data))
  } catch {
    // Ignore quota / restricted-environment failures silently.
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a command run. No-op when telemetry is disabled (default).
 * Called from `runCommandWithArgs` in SpotlightProvider.
 */
export function recordTelemetryRun(commandId: string): void {
  if (!isTelemetryEnabled()) return

  const data = readTelemetry()
  const existing = data.find((entry) => entry[0] === commandId)

  let updated: TelemetryData
  if (existing) {
    // Increment existing entry count.
    updated = data.map((entry): TelemetryEntry =>
      entry[0] === commandId ? [entry[0], entry[1] + 1] : entry,
    )
  } else {
    // New command — append.
    updated = [...data, [commandId, 1]]
  }

  // Sort descending by count so getTopCommands is a cheap slice.
  updated.sort((a, b) => b[1] - a[1])

  // LRU eviction: keep only the top MAX_ENTRIES by run count.
  if (updated.length > MAX_ENTRIES) {
    updated = updated.slice(0, MAX_ENTRIES)
  }

  writeTelemetry(updated)
}

/**
 * Erase all telemetry data. Used by the "Clear spotlight history" button in
 * Settings → Preferences → Spotlight.
 */
export function clearTelemetry(): void {
  try {
    localStorage.removeItem(TELEMETRY_KEY)
  } catch {
    // Ignore
  }
}
