/**
 * Anthropic `count_tokens` client for the snapshot-tokens benchmark.
 *
 * Talks directly to `POST https://api.anthropic.com/v1/messages/count_tokens`
 * — no SDK (repo rule: no provider SDKs). Given a string, returns the exact,
 * model-accurate input-token count Anthropic reports for it as a single user
 * message.
 *
 * Design choices:
 * - The response body is validated with a TypeBox schema via `parseJsonResponse`
 *   — no `as` at the HTTP boundary (repo rule for external-API fetches).
 * - `fetch` is injectable (`fetchImpl`) so the unit test exercises request
 *   shape + validation with no network.
 * - Counts are cached per identical string within a run (the JSON and HTML
 *   sides of a page never collide, but repeated identical strings are free).
 * - No API key → `available: false`; the bench skips gracefully instead of
 *   crashing the whole suite.
 */

import { Type, type Static } from '@sinclair/typebox'
import { parseJsonResponse } from '@core/utils/jsonValidate'

const COUNT_TOKENS_ENDPOINT = 'https://api.anthropic.com/v1/messages/count_tokens'
const ANTHROPIC_VERSION = '2023-06-01'
/** Default model whose tokenizer the benchmark measures against. */
export const DEFAULT_COUNT_MODEL = 'claude-sonnet-4-6'

const CountTokensResponseSchema = Type.Object({
  input_tokens: Type.Number(),
})
type CountTokensResponse = Static<typeof CountTokensResponseSchema>

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface TokenCounterOptions {
  /** API key; defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string
  /** Model id whose tokenizer to measure; defaults to `DEFAULT_COUNT_MODEL`. */
  model?: string
  /** Injectable fetch (test seam); defaults to the global `fetch`. */
  fetchImpl?: FetchLike
  /** Override endpoint (tests); defaults to the real count_tokens URL. */
  endpoint?: string
}

export interface TokenCounter {
  /** False when no API key is configured — the bench skips itself. */
  readonly available: boolean
  /** Model id the counts are measured against. */
  readonly model: string
  /** Count input tokens for `text` (cached per identical string). */
  count(text: string): Promise<number>
}

/**
 * Build a token counter. Pure construction — no network until `count` is called.
 */
export function createTokenCounter(options: TokenCounterOptions = {}): TokenCounter {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
  const model = options.model ?? DEFAULT_COUNT_MODEL
  const endpoint = options.endpoint ?? COUNT_TOKENS_ENDPOINT
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const available = apiKey.length > 0
  const cache = new Map<string, number>()

  return {
    available,
    model,
    async count(text: string): Promise<number> {
      if (!available) {
        throw new Error(
          'Anthropic token counter is unavailable: set ANTHROPIC_API_KEY to enable count_tokens.',
        )
      }
      const cached = cache.get(text)
      if (cached !== undefined) return cached

      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
        }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(
          `count_tokens failed (${res.status} ${res.statusText})${detail ? `: ${detail}` : ''}`,
        )
      }

      const body: CountTokensResponse = await parseJsonResponse(res, CountTokensResponseSchema)
      cache.set(text, body.input_tokens)
      return body.input_tokens
    },
  }
}
