/**
 * Shared tolerant-parsing primitives used by the page-tree schema parsers.
 *
 * The split-out schema files (`breakpoint`, `cssClass`, `pageNode`, etc.) each
 * carry their own `parseX` helper that mirrors the persisted shape. The
 * lowest-level building blocks live here so we don't end up with five copies
 * of "narrow `unknown` to a plain object before reading fields".
 *
 * Error format: helpers that participate in path-propagation throw `Error`
 * with messages of the form `"<relative-path>: <description>"`. The caller
 * prepends its own path segment before re-throwing. `parseSiteDocument`
 * accumulates the full path; `persistence/validate.ts` extracts it via the
 * `"<relative-path>: <description>"` convention.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

/**
 * Narrow `raw` to a plain object record, or return `null` if it is null,
 * not an object, or an array. Used by every tolerant parser to start
 * "is this a parseable record?" checks before reaching for fields.
 */
export function asPlainObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

/**
 * Read a required string field from a record. Throws a path-prefixed error
 * if absent or not a string — callers bubble the path so validate.ts can
 * report the exact invalid location.
 */
export function requireStringField(r: Record<string, unknown>, field: string, path: string): string {
  const v = r[field]
  if (typeof v !== 'string') throw new Error(`${path}.${field}: Expected string`)
  return v
}

/**
 * Read a required array field, throwing a path-prefixed error if absent or
 * not an array. Returns the raw array; callers filter / coerce as needed.
 */
export function requireArrayField(r: Record<string, unknown>, field: string, path: string): unknown[] {
  const v = r[field]
  if (!Array.isArray(v)) throw new Error(`${path}.${field}: Expected array`)
  return v
}

/** Keep only the string entries of an array. */
export function onlyStrings(items: readonly unknown[]): string[] {
  return items.filter((c): c is string => typeof c === 'string')
}

/** Parse a styles bag — any plain object becomes a `Record<string, unknown>`, else `{}`. */
export function parseStylesBag(raw: unknown): Record<string, unknown> {
  return asPlainObject(raw) ?? {}
}

/** Parse a breakpoint → styles map. Skips entries whose value is not a plain object. */
export function parseBreakpointStylesBag(raw: unknown): Record<string, Record<string, unknown>> {
  const outer = asPlainObject(raw)
  if (!outer) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [k, v] of Object.entries(outer)) {
    const inner = asPlainObject(v)
    if (inner) out[k] = inner
  }
  return out
}

/** Parse a tag list — keeps only string entries; absent/invalid arrays yield undefined. */
export function parseStringArrayField(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter((t): t is string => typeof t === 'string')
}

/** Parse a numeric timestamp — non-numeric values fall back to `Date.now()`. */
export function parseTimestamp(raw: unknown): number {
  return typeof raw === 'number' ? raw : Date.now()
}
