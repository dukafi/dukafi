/**
 * Schema coverage for the M11–M16 admin API payloads.
 *
 * These schemas replace the previous hand-written TypeScript response types
 * for AI, images, themes, shipping, and jobs. The check pins that each
 * schema still accepts a representative payload so a future rename cannot
 * silently drop the contract.
 */
import { describe, expect, it } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import {
  CmsAiConnectionSchema,
  CmsAiConnectionsResponseSchema,
  CmsAiDefaultsSchema,
  CmsAiImageResponseSchema,
  CmsJobsStatusResponseSchema,
  CmsShippingRatesResponseSchema,
  CmsThemeCatalogueResponseSchema,
} from '@core/persistence/responseSchemas'

describe('M11–M16 response schemas', () => {
  it('accepts an AI connections payload', () => {
    expect(Value.Check(CmsAiConnectionsResponseSchema, {
      connections: [{
        id: 1, name: 'OpenRouter', provider: 'openrouter', baseUrl: null,
        chatModel: 'openai/gpt-4o-mini', imageModel: null, priority: 10,
        disabled: false, isSet: true,
      }],
      providers: [{ id: 'openrouter', label: 'OpenRouter', authMode: 'api_key' }],
    })).toBe(true)
    expect(Value.Check(CmsAiConnectionSchema, {
      id: 1, name: 'Local', provider: 'ollama', priority: 100, disabled: false, isSet: false,
    })).toBe(true)
  })

  it('accepts AI defaults and image generation payloads', () => {
    expect(Value.Check(CmsAiDefaultsSchema, {
      chat: { connectionId: 1, model: 'llama3' },
      image: null,
    })).toBe(true)
    expect(Value.Check(CmsAiImageResponseSchema, {
      asset: {
        id: '1', filename: 'ai.png', mimeType: 'image/png', sizeBytes: 10,
        publicPath: '/uploads/ai.png', uploadedByUserId: null, createdAt: '2026-01-01',
        altText: '', caption: '', title: '', tags: [], width: 1, height: 1,
        durationMs: null, dominantColor: null, deletedAt: null, replacedAt: null,
        folderIds: [], blurHash: null, variants: [], posterPath: null,
      },
      provider: 'openrouter',
      model: 'flux',
    })).toBe(true)
  })

  it('accepts theme, shipping, and jobs payloads', () => {
    expect(Value.Check(CmsThemeCatalogueResponseSchema, {
      themes: [{ id: 'duka-classic', name: 'Duka Classic', version: '1.0.0' }],
      total: 1,
      degraded: true,
    })).toBe(true)
    expect(Value.Check(CmsShippingRatesResponseSchema, {
      rates: [{ provider: 'flat_rate', id: 'flat', label: 'Flat rate', amountCents: 500 }],
    })).toBe(true)
    expect(Value.Check(CmsJobsStatusResponseSchema, {
      jobs: [{
        pluginId: 'probe', name: 'heartbeat', every: '15m', lastRunAt: null, due: true,
      }],
    })).toBe(true)
  })
})
