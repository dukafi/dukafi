/**
 * Shared scaffolding for SERVER-backed spotlight providers.
 *
 * Every server provider repeats the same skeleton: validate the response with
 * a TypeBox schema via `apiRequest` (`@core/http`) and translate an aborted
 * request (the palette cancels in-flight searches on each keystroke) into an
 * empty result set instead of a thrown error.
 *
 * Two entry points:
 *   - `makeServerProvider` — the common case. Owns the empty-query guard, the
 *     `?query=&limit=` URL construction, the fetch + abort handling, and the
 *     `select(body).map(toCommand)` mapping. A provider supplies ONLY its
 *     schema, the array selector, and the Command mapper.
 *   - `fetchOnAbortEmpty` — the lower-level fetch + abort primitive, for the
 *     rare provider with a genuinely different shape (no query param, an extra
 *     filter loop) that can't use the factory but still shares abort handling.
 */

import type { SpotlightProvider, Command } from '../types'
import { apiRequest, isAbortError } from '@core/http'
import type { Static, TSchema } from '@core/utils/typeboxHelpers'

/** Hard cap on results requested per server provider. */
export const MAX_RESULTS = 25

/**
 * Fetch + validate a URL, returning the parsed body or `null` when the request
 * was aborted. Non-abort errors propagate so the palette can surface them.
 */
export async function fetchOnAbortEmpty<S extends TSchema>(
  url: string,
  schema: S,
  signal: AbortSignal,
): Promise<Static<S> | null> {
  try {
    return await apiRequest(url, { schema, signal })
  } catch (err) {
    if (isAbortError(err)) return null
    throw err
  }
}

interface ServerProviderConfig<S extends TSchema, TItem> {
  id: string
  /** Becomes the group header in results. */
  label: string
  /** Debounce in ms — applied per provider. */
  debounceMs?: number
  /** Endpoint path; the factory appends `?query=<q>&limit=<MAX_RESULTS>`. */
  endpoint: string
  /** TypeBox schema validating the response body. */
  schema: S
  /** Pick the result array out of the validated body. */
  select: (body: Static<S>) => readonly TItem[]
  /** Map one result item to a spotlight Command. */
  toCommand: (item: TItem) => Command
}

/**
 * Build a SERVER spotlight provider from its schema, array selector, and
 * Command mapper. Owns the empty-query guard, URL construction, fetch + abort
 * handling, and result mapping.
 */
export function makeServerProvider<S extends TSchema, TItem>(
  config: ServerProviderConfig<S, TItem>,
): SpotlightProvider {
  const { id, label, debounceMs, endpoint, schema, select, toCommand } = config

  return {
    id,
    label,
    debounceMs,

    async search(query, _ctx, signal): Promise<Command[]> {
      if (!query.trim()) return []

      const url = `${endpoint}?query=${encodeURIComponent(query)}&limit=${MAX_RESULTS}`
      const body = await fetchOnAbortEmpty(url, schema, signal)
      if (body === null) return []

      return select(body).map(toCommand)
    },
  }
}
