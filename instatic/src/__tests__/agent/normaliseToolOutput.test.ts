import { describe, expect, it } from 'bun:test'
import { normaliseToolOutput } from '../../../server/ai/drivers/http/execTool'

/**
 * Mirrors how drivers consume an `AiToolOutput` (see `toolOutputToString` in
 * responses-shared.ts): success serializes `data`, failure reads `error`.
 */
function consumeDownstream(output: ReturnType<typeof normaliseToolOutput>): string {
  if (!output.ok) return output.error ?? 'Tool call failed.'
  return JSON.stringify(output.data ?? { ok: true })
}

describe('normaliseToolOutput', () => {
  it('passes a well-formed success envelope through unchanged', () => {
    const out = normaliseToolOutput({ ok: true, data: { rows: [1, 2] } })
    expect(out).toEqual({ ok: true, data: { rows: [1, 2] } })
    expect(consumeDownstream(out)).toBe(JSON.stringify({ rows: [1, 2] }))
  })

  it('passes a well-formed error envelope through unchanged', () => {
    const out = normaliseToolOutput({ ok: false, error: 'boom' })
    expect(out).toEqual({ ok: false, error: 'boom' })
    expect(consumeDownstream(out)).toBe('boom')
  })

  it('treats { ok: false } without an error as a valid failure (not wrapped)', () => {
    // `error` is optional on the envelope, so this is a legitimate failure
    // result — wrapping it as success would flip a failure into a success.
    const out = normaliseToolOutput({ ok: false })
    expect(out.ok).toBe(false)
    expect(consumeDownstream(out)).toBe('Tool call failed.')
  })

  it('wraps a truthy-but-non-boolean { ok: 3 } instead of trusting it', () => {
    const out = normaliseToolOutput({ ok: 3 })
    // The old duck-type (`'ok' in result`) let this through, then `output.ok`
    // read as truthy. Validation rejects it and wraps the raw value as data.
    expect(out).toEqual({ ok: true, data: { ok: 3 } })
    expect(consumeDownstream(out)).toBe(JSON.stringify({ ok: 3 }))
  })

  it('wraps a bare primitive return', () => {
    expect(normaliseToolOutput('hello')).toEqual({ ok: true, data: 'hello' })
    expect(normaliseToolOutput(42)).toEqual({ ok: true, data: 42 })
  })

  it('wraps an object that lacks an ok field', () => {
    const out = normaliseToolOutput({ rows: [], total: 0 })
    expect(out).toEqual({ ok: true, data: { rows: [], total: 0 } })
  })

  it('wraps null / undefined returns as success with that data', () => {
    expect(normaliseToolOutput(null)).toEqual({ ok: true, data: null })
    expect(normaliseToolOutput(undefined)).toEqual({ ok: true, data: undefined })
  })
})
