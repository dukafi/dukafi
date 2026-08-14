import { describe, it, expect } from 'bun:test'
import {
  createTokenCounter,
  DEFAULT_COUNT_MODEL,
  type FetchLike,
} from '../../../scripts/bench/lib/anthropicTokens'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('createTokenCounter — request shape', () => {
  it('POSTs the text as a single user message with the right headers and body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ input_tokens: 42 })
    }

    const counter = createTokenCounter({ apiKey: 'sk-test', model: 'claude-x', fetchImpl })
    expect(counter.available).toBe(true)
    expect(counter.model).toBe('claude-x')

    const tokens = await counter.count('Hello world')
    expect(tokens).toBe(42)

    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages/count_tokens')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['content-type']).toBe('application/json')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('claude-x')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello world' }])
  })

  it('defaults the model to DEFAULT_COUNT_MODEL', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ input_tokens: 1 })
    const counter = createTokenCounter({ apiKey: 'sk-test', fetchImpl })
    expect(counter.model).toBe(DEFAULT_COUNT_MODEL)
    await counter.count('x')
  })
})

describe('createTokenCounter — caching', () => {
  it('caches counts per identical string within a run', async () => {
    let n = 0
    const fetchImpl: FetchLike = async () => {
      n += 1
      return jsonResponse({ input_tokens: 7 })
    }
    const counter = createTokenCounter({ apiKey: 'sk-test', fetchImpl })

    expect(await counter.count('same')).toBe(7)
    expect(await counter.count('same')).toBe(7)
    expect(await counter.count('different')).toBe(7)
    // 'same' counted once (cached on the second call), 'different' once.
    expect(n).toBe(2)
  })
})

describe('createTokenCounter — graceful no-key', () => {
  it('reports unavailable and refuses to count without an API key', async () => {
    const counter = createTokenCounter({ apiKey: '' })
    expect(counter.available).toBe(false)
    await expect(counter.count('x')).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})

describe('createTokenCounter — response validation', () => {
  it('throws when the response body fails TypeBox validation', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ wrong: 'shape' })
    const counter = createTokenCounter({ apiKey: 'sk-test', fetchImpl })
    await expect(counter.count('x')).rejects.toThrow()
  })

  it('throws with status detail on a non-ok HTTP response', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' })
    const counter = createTokenCounter({ apiKey: 'sk-test', fetchImpl })
    await expect(counter.count('x')).rejects.toThrow(/429/)
  })
})
