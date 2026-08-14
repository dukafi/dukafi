import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'

describe('SearchBar native search controls', () => {
  it('hides the browser-provided search cancel button so only the app clear button appears', () => {
    const css = readFileSync(
      new URL('../../ui/components/SearchBar/SearchBar.module.css', import.meta.url),
      'utf-8',
    )

    expect(css).toMatch(/::-webkit-search-cancel-button/)
    expect(css).toMatch(/-webkit-appearance:\s*none/)
    expect(css).toMatch(/display:\s*none/)
  })
})
