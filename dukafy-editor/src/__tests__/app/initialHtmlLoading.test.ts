import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const INDEX_HTML_PATH = join(import.meta.dir, '../../../index.html')

describe('initial HTML loading shell', () => {
  it('renders the loading spinner before the React bundle executes', () => {
    const html = readFileSync(INDEX_HTML_PATH, 'utf8')
    const styleIndex = html.indexOf('<style data-initial-loader>')
    const rootIndex = html.indexOf('<div id="root">')
    const scriptIndex = html.indexOf('<script type="module" src="/src/admin/main.tsx">')

    expect(styleIndex).toBeGreaterThan(-1)
    expect(rootIndex).toBeGreaterThan(-1)
    expect(scriptIndex).toBeGreaterThan(rootIndex)
    expect(styleIndex).toBeLessThan(rootIndex)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Loading Dukafy"')
    expect(html).toContain('data-initial-loader-spinner="true"')
    expect(html).not.toContain('<div id="root"></div>')
  })
})

/**
 * The theme has to be on the root element BEFORE first paint.
 *
 * `data-editor-theme` is what swaps the token palette, but React only sets it
 * after mount. The shell used to hardcode `class="dark"`, so a merchant who
 * chose Light got a dark flash on every page load — worst in Commerce, where
 * a merchant actually spends the day.
 */
describe('initial theme application', () => {
  const html = readFileSync(INDEX_HTML_PATH, 'utf8')

  it('no longer hardcodes a theme on <html>', () => {
    expect(html).not.toContain('<html lang="en" class="dark">')
  })

  it('applies the saved theme before the loader styles', () => {
    const scriptIndex = html.indexOf("localStorage.getItem('instatic-editor-prefs')")
    const styleIndex = html.indexOf('<style data-initial-loader>')

    expect(scriptIndex).toBeGreaterThan(-1)
    // Must run before the shell paints, and before the React bundle.
    expect(scriptIndex).toBeLessThan(styleIndex)
    expect(html).toContain("setAttribute('data-editor-theme', theme)")
  })

  it('only accepts known theme values', () => {
    // A corrupt preference must not become an arbitrary attribute value.
    expect(html).toContain("stored === 'light' || stored === 'dark'")
  })

  it('defaults to light when nothing is stored', () => {
    // Light is the product default now, and globals.css still carries the dark
    // palette on bare `:root` — so the attribute must always be written.
    expect(html).toContain("var theme = 'light'")
  })

  it('paints the loader itself in the chosen theme', () => {
    // globals.css has not loaded at this point, so both palettes are spelled
    // out in the shell: light as the base, dark as the opt-in override.
    expect(html).toContain("[data-editor-theme='dark'] .loading")
  })

  it('survives storage being unavailable', () => {
    // Private-mode Safari throws on localStorage access; a throw here would
    // stop the shell from rendering at all.
    expect(html).toContain('try {')
    expect(html).toContain('catch (e)')
  })
})
