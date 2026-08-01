import { describe, expect, it } from 'bun:test'
import { Type } from '@core/utils/typeboxHelpers'
import {
  compiled,
  compiledFormatValueErrors,
  compiledSafeParseValue,
} from '@core/utils/typeboxCompiler'

describe('typeboxCompiler helpers', () => {
  it('reuses a compiled validator for the same schema object', () => {
    const Schema = Type.Object({ id: Type.String() })

    expect(compiled(Schema)).toBe(compiled(Schema))
    expect(compiled(Schema).Check({ id: 'row-1' })).toBe(true)
    expect(compiled(Schema).Check({ id: 1 })).toBe(false)
  })

  it('returns decoded values and compact errors from compiled validation', () => {
    const Schema = Type.Object({
      id: Type.String(),
      count: Type.Number(),
    })

    expect(compiledSafeParseValue(Schema, { id: 'row-1', count: 3 })).toEqual({
      ok: true,
      value: { id: 'row-1', count: 3 },
    })

    const result = compiledSafeParseValue(Schema, { id: 'row-1', count: '3' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toEqual({ path: '/count', message: 'Expected number' })
    }

    expect(compiledFormatValueErrors(Schema, { id: 1, count: '3' })).toBe(
      '/id: Expected string; /count: Expected number',
    )
  })
})
