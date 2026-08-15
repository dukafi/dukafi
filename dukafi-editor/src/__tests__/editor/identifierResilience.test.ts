/**
 * Identifier normalisation against documents the editor did not author.
 *
 * Nodes reach the canvas from the HTML importer, from MCP edits and from
 * server-side seeds, and any of those can omit a prop the schema types as a
 * string. `.replace` on the resulting `undefined` threw inside the module's
 * render and took the whole subtree down with "Render failed in
 * node-renderer" — a blank canvas for a missing form id.
 */
import { describe, expect, it } from 'bun:test'
import { normalizeIdentifierInput, normalizeIdentifierValue } from '@core/utils/identifier'

describe('identifier normalisation is total', () => {
  it('survives a prop that is not there', () => {
    // The exact shape that crashed: a seeded `base.form` with `props: {}`.
    expect(normalizeIdentifierValue(undefined as unknown as string, 'form')).toBe('form')
    expect(normalizeIdentifierInput(undefined as unknown as string)).toBe('')
    expect(normalizeIdentifierValue(null as unknown as string, 'form')).toBe('form')
  })

  it('still normalises what it is given', () => {
    expect(normalizeIdentifierValue('Order Payment', 'form')).toBe('Order-Payment')
    expect(normalizeIdentifierValue('  ', 'form')).toBe('form')
    expect(normalizeIdentifierValue('checkout--form-', 'form')).toBe('checkout-form')
  })
})
