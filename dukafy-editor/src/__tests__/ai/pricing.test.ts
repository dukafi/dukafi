import { describe, test, expect } from 'bun:test'
import { pricingKey, computeCostUsd, type TokenPrices } from '../../../server/ai/pricing'

describe('pricingKey normalisation', () => {
  test('collapses a provider-prefixed dotted OpenRouter slug to the bare key', () => {
    expect(pricingKey('anthropic/claude-opus-4.8')).toBe('claude-opus-4-8')
    expect(pricingKey('openai/gpt-5.4')).toBe('gpt-5-4')
  })

  test('strips an Anthropic dated suffix to match the OpenRouter slug', () => {
    // Native Anthropic id (dashed, dated) and OpenRouter slug (prefixed,
    // dotted) must resolve to the same key.
    expect(pricingKey('claude-opus-4-8-20260514')).toBe('claude-opus-4-8')
    expect(pricingKey('claude-opus-4-8-20260514')).toBe(pricingKey('anthropic/claude-opus-4.8'))
  })

  test('strips an OpenAI YYYY-MM-DD snapshot suffix', () => {
    expect(pricingKey('gpt-5.4-2026-03-01')).toBe('gpt-5-4')
  })

  test('preserves variant suffixes that denote a different SKU', () => {
    expect(pricingKey('anthropic/claude-opus-4.8-fast')).toBe('claude-opus-4-8-fast')
    expect(pricingKey('anthropic/claude-opus-4.8:thinking')).toBe('claude-opus-4-8:thinking')
    // The variant must NOT collide with the base model's key.
    expect(pricingKey('anthropic/claude-opus-4.8-fast')).not.toBe(pricingKey('anthropic/claude-opus-4.8'))
  })
})

describe('computeCostUsd', () => {
  // $5 / $25 per-MTok input/output; cache read $0.50, write $6.25 (Opus 4.8).
  const prices: TokenPrices = {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  }

  test('Anthropic: prompt tokens are cache-free; cache buckets bill separately', () => {
    // 1M regular input + 1M output + 1M cache read + 1M cache write
    const cost = computeCostUsd(prices, 'anthropic', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    })
    // 5 + 25 + 0.5 + 6.25
    expect(cost).toBe(36.75)
  })

  test('OpenAI: cached tokens are a subset of promptTokens (no write bucket)', () => {
    // 1M total input of which 0.4M cached → 0.6M regular input.
    const cost = computeCostUsd(prices, 'openai', {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cacheReadTokens: 400_000,
      cacheCreationTokens: 0,
    })
    // 0.6 * 5 (regular) + 0.4 * 0.5 (cache read) = 3 + 0.2
    expect(cost).toBe(3.2)
  })

  test('falls back to the input rate when a cache rate is absent', () => {
    const noCacheRates: TokenPrices = {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheReadPerMTok: null,
      cacheWritePerMTok: null,
    }
    const cost = computeCostUsd(noCacheRates, 'anthropic', {
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
    })
    // cache read priced at the standard input rate (5) when no cache rate.
    expect(cost).toBe(5)
  })
})
