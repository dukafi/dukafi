/**
 * ClassPicker usage tracker — recent + most-used signals for this installation.
 *
 * The ClassPicker dropdown surfaces "Recent" and "Frequent" sections when the
 * input is empty so users don't have to scroll past the alphabetical class
 * registry to re-add classes they actually use. This module owns the
 * persistence: a `classId → { lastUsedAt, count }` map kept in localStorage
 * and validated through TypeBox at the boundary. The CMS has one active site
 * per installation, so there is no tenant/site key in this local UI state.
 *
 * Why localStorage (not the site document):
 *   - This is local UI/UX state, not part of the published site. Storing it
 *     server-side would force a write on every class assignment.
 *   - Reading is hot (every dropdown open), so the JSON.parse cost has to stay
 *     trivial. localStorage is fine for a few KB.
 *
 * Resilience: a corrupt entry never bricks the picker. `parseJsonWithFallback`
 * returns the default `{}` map on any TypeBox failure.
 */

import { Type, type Static } from '@sinclair/typebox'
import { parseJsonWithFallback } from '@core/utils/jsonValidate'

export const CLASS_USAGE_STORAGE_KEY = 'instatic-class-usage'

/** How many entries each section shows when the input is empty. */
export const CLASS_USAGE_RECENT_LIMIT = 8
export const CLASS_USAGE_FREQUENT_LIMIT = 8

const ClassUsageEntrySchema = Type.Object({
  lastUsedAt: Type.Number(),
  count: Type.Number(),
})

const ClassUsageMapSchema = Type.Record(Type.String(), ClassUsageEntrySchema)

type ClassUsageMap = Static<typeof ClassUsageMapSchema>
type ClassUsageEntry = Static<typeof ClassUsageEntrySchema>

const EMPTY_USAGE_MAP: ClassUsageMap = {}

// ---------------------------------------------------------------------------
// Storage IO
// ---------------------------------------------------------------------------

function readUsageMap(): ClassUsageMap {
  const raw = globalThis.localStorage?.getItem(CLASS_USAGE_STORAGE_KEY) ?? null
  return parseJsonWithFallback(raw, ClassUsageMapSchema, EMPTY_USAGE_MAP)
}

function writeUsageMap(next: ClassUsageMap): void {
  try {
    globalThis.localStorage?.setItem(CLASS_USAGE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage may be unavailable (quota, private mode). Usage tracking is
    // a UX nicety; failing the write is benign.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record that a class was added to a node.
 *
 * Increments `count` by one and stamps `lastUsedAt` to `Date.now()`. New
 * entries start with `count: 1`.
 */
export function recordClassUsage(classId: string): void {
  if (!classId) return
  const map = readUsageMap()
  const prev: ClassUsageEntry = map[classId] ?? { lastUsedAt: 0, count: 0 }
  const nextEntry: ClassUsageEntry = {
    lastUsedAt: Date.now(),
    count: prev.count + 1,
  }
  writeUsageMap({
    ...map,
    [classId]: nextEntry,
  })
}

/** Read the installation-local usage table. */
export function readClassUsage(): Record<string, ClassUsageEntry> {
  return readUsageMap()
}

/**
 * Drop one or more class IDs from the usage table.
 *
 * Called when classes are deleted so dead IDs don't linger in the recents.
 * (Keeping them is harmless — the picker filters against the live registry —
 * but cleanup keeps localStorage tidy over time.)
 */
export function forgetClassUsage(classIds: readonly string[]): void {
  if (classIds.length === 0) return
  const map = readUsageMap()
  let changed = false
  const nextMap: Record<string, ClassUsageEntry> = { ...map }
  for (const id of classIds) {
    if (id in nextMap) {
      delete nextMap[id]
      changed = true
    }
  }
  if (!changed) return
  writeUsageMap(nextMap)
}

/**
 * Resolve "Recent" and "Frequent" class IDs from a usage table, deduplicating
 * so a class only appears once across the two sections.
 *
 * `availableClassIds` is the set of class IDs the caller wants to surface
 * (typically: all user-visible classes that are NOT already assigned to the
 * current node). Pass it explicitly so the helper can be unit-tested without
 * needing the site fixture machinery.
 *
 * Recent wins ties: a class that's both recent AND frequent shows up under
 * Recent only, freeing the Frequent slot for the next-best candidate.
 */
export function selectRecentAndFrequent(
  usage: Record<string, ClassUsageEntry>,
  availableClassIds: readonly string[],
  limits: { recent?: number; frequent?: number } = {},
): { recent: string[]; frequent: string[] } {
  const recentLimit = limits.recent ?? CLASS_USAGE_RECENT_LIMIT
  const frequentLimit = limits.frequent ?? CLASS_USAGE_FREQUENT_LIMIT

  // Filter usage entries to only those whose class is currently available.
  // We pass through availableClassIds (rather than Object.keys(usage)) because
  // the caller may want to filter out already-assigned classes.
  const available = new Set(availableClassIds)
  const entries: Array<{ id: string; lastUsedAt: number; count: number }> = []
  for (const id of available) {
    const entry = usage[id]
    if (!entry || entry.count <= 0) continue
    entries.push({ id, lastUsedAt: entry.lastUsedAt, count: entry.count })
  }

  const byRecent = [...entries].sort((a, b) => {
    if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
    // Tiebreak by count, then id, so the order is fully deterministic for tests.
    if (b.count !== a.count) return b.count - a.count
    return a.id.localeCompare(b.id)
  })
  const recent = byRecent.slice(0, recentLimit).map((e) => e.id)
  const recentSet = new Set(recent)

  const byFrequency = entries
    .filter((e) => !recentSet.has(e.id))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
      return a.id.localeCompare(b.id)
    })
  const frequent = byFrequency.slice(0, frequentLimit).map((e) => e.id)

  return { recent, frequent }
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

/** Wipes the entire usage map. Used by tests. */
export function __resetClassUsageForTests(): void {
  try {
    globalThis.localStorage?.removeItem(CLASS_USAGE_STORAGE_KEY)
  } catch {
    // Same fallback as writeUsageMap — best-effort.
  }
}
