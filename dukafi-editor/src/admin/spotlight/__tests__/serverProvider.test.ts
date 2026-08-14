/**
 * Unit tests for the shared SERVER-provider scaffolding.
 *
 * `makeServerProvider` and `fetchOnAbortEmpty` own the skeleton that the four
 * server-backed spotlight providers used to copy-paste: the empty-query guard,
 * the `?query=&limit=` URL construction, and the `apiRequest` + `isAbortError`
 * try/catch. These tests pin that behavior so the providers stay byte-identical
 * in effect after the extraction.
 */

import { describe, it, expect, spyOn, afterEach } from 'bun:test'
import { Type } from '@core/utils/typeboxHelpers'
import type { Command, CommandContext } from '../types'
import { MAX_RESULTS, makeServerProvider, fetchOnAbortEmpty } from '../providers/serverProvider'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ResponseSchema = Type.Object(
  { items: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })) },
  { additionalProperties: true },
)

const ENDPOINT = '/admin/api/test/search'
const ctx = {} as CommandContext
const signal = new AbortController().signal

function makeProvider() {
  return makeServerProvider({
    id: 'test',
    label: 'Test',
    debounceMs: 150,
    endpoint: ENDPOINT,
    schema: ResponseSchema,
    select: (body) => body.items,
    toCommand: (item): Command => ({
      id: `test:${item.id}`,
      title: item.name,
      group: 'results',
      run: () => {},
    }),
  })
}

/** A `fetch` stub returning a JSON body with HTTP 200. */
function jsonFetch(body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
}

function abortError(): Error {
  const err = new Error('aborted')
  err.name = 'AbortError'
  return err
}

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.()
})

// ─── Empty-query guard ──────────────────────────────────────────────────────

describe('makeServerProvider — empty-query guard', () => {
  it('returns [] for an empty query without calling fetch', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    const result = await makeProvider().search('', ctx, signal)
    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns [] for a whitespace-only query without calling fetch', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    const result = await makeProvider().search('   ', ctx, signal)
    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── URL construction ───────────────────────────────────────────────────────

describe('makeServerProvider — URL construction', () => {
  it('builds the endpoint with the query and limit params', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      jsonFetch({ items: [] }) as typeof fetch,
    )
    await makeProvider().search('hello world', ctx, signal)
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toBe(`${ENDPOINT}?query=hello%20world&limit=${MAX_RESULTS}`)
  })
})

// ─── Schema validation + mapping ─────────────────────────────────────────────

describe('makeServerProvider — schema validation and mapping', () => {
  it('validates the body via the schema and maps each item to a Command', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(
      jsonFetch({ items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] }) as typeof fetch,
    )
    const result = await makeProvider().search('x', ctx, signal)
    expect(result).toEqual([
      { id: 'test:a', title: 'Alpha', group: 'results', run: expect.any(Function) },
      { id: 'test:b', title: 'Beta', group: 'results', run: expect.any(Function) },
    ])
  })

  it('throws when the body fails schema validation', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(
      jsonFetch({ items: [{ id: 123 }] }) as typeof fetch,
    )
    await expect(makeProvider().search('x', ctx, signal)).rejects.toThrow()
  })
})

// ─── Abort handling ─────────────────────────────────────────────────────────

describe('makeServerProvider — abort handling', () => {
  it('returns [] (does not throw) when the request is aborted', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(abortError()))
    const result = await makeProvider().search('x', ctx, signal)
    expect(result).toEqual([])
  })

  it('rethrows a non-abort error', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('boom')))
    await expect(makeProvider().search('x', ctx, signal)).rejects.toThrow('boom')
  })
})

// ─── fetchOnAbortEmpty primitive ─────────────────────────────────────────────

describe('fetchOnAbortEmpty', () => {
  it('returns the validated body on success', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(
      jsonFetch({ items: [{ id: 'a', name: 'Alpha' }] }) as typeof fetch,
    )
    const body = await fetchOnAbortEmpty(ENDPOINT, ResponseSchema, signal)
    expect(body).toEqual({ items: [{ id: 'a', name: 'Alpha' }] })
  })

  it('returns null when the request is aborted', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(abortError()))
    const body = await fetchOnAbortEmpty(ENDPOINT, ResponseSchema, signal)
    expect(body).toBeNull()
  })

  it('rethrows a non-abort error', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('boom')))
    await expect(fetchOnAbortEmpty(ENDPOINT, ResponseSchema, signal)).rejects.toThrow('boom')
  })
})
