import { describe, expect, it } from 'bun:test'
import { checkSizeLimit } from '@core/files/upload'

const MB = 1024 * 1024

describe('checkSizeLimit', () => {
  it('allows files under 10 MB with no warning', () => {
    const result = checkSizeLimit(5 * MB)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('none')
  })

  it('warns for files from 10 MB up to the hard limit', () => {
    const result = checkSizeLimit(10 * MB)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('soft')
    expect(result.message).toBeTruthy()
  })

  it('still allows files just under 50 MB', () => {
    const result = checkSizeLimit(50 * MB - 1)
    expect(result.ok).toBe(true)
    expect(result.level).toBe('soft')
  })

  it('blocks files at or above 50 MB', () => {
    const result = checkSizeLimit(50 * MB)
    expect(result.ok).toBe(false)
    expect(result.level).toBe('hard')
    expect(result.message).toMatch(/50.?MB/i)
  })
})
