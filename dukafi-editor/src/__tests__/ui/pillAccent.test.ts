import { describe, expect, it } from 'bun:test'
import { pillAccent } from '@ui/pillAccent'

describe('pillAccent', () => {
  it('uses the first meaningful character instead of punctuation', () => {
    expect(pillAccent('.alpha')).toBe(pillAccent('alpha'))
    expect(pillAccent('::before')).toBe(pillAccent('before'))
    expect(pillAccent('  #hero')).toBe(pillAccent('hero'))
  })

  it('keeps labels with the same first meaningful character together', () => {
    expect(pillAccent('alpha')).toBe(pillAccent('alert'))
    expect(pillAccent('Button')).toBe(pillAccent('body'))
    expect(pillAccent('2xl')).toBe(pillAccent('24px'))
  })

  it('assigns every latin letter a distinct accent key', () => {
    const accents = new Set(
      'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => pillAccent(letter)),
    )

    expect(accents.size).toBe(26)
  })
})
