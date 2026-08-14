/**
 * Architecture Gate — the canvas shows a page, not a themed admin surface.
 *
 * The canvas previews a STOREFRONT page. What it paints behind that page must
 * not depend on whether the merchant chose a light or dark admin, because the
 * merchant's own design is what is supposed to be visible there.
 *
 * This exists because of a real bug that survived a long time: these surfaces
 * were painted with `var(--overlay)`, which is an INVERTING scale — `#ffffff`
 * under the dark admin, `#111827` under the light one. It looked deliberate
 * for as long as the admin was dark-only. The day light became the default,
 * every canvas turned navy and every merchant page that sets no body
 * background became unreadable on it.
 *
 * `color-scheme: light` on the iframe is not sufficient on its own: it governs
 * the UA's default canvas, and an explicit `background` paints straight over
 * it. Both halves are needed, so both are pinned here.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(import.meta.dir, '../..')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

/** Every surface that stands behind a rendered storefront page. */
const PAGE_SURFACES = [
  'admin/pages/site/canvas/IframeFrameSurface.module.css',
  'admin/pages/site/canvas/BreakpointFrame.module.css',
  'admin/pages/site/preview/PreviewOverlay.module.css',
  'admin/pages/site/panels/SiteExplorerPanel/SiteExplorerPanel.module.css',
]

/**
 * Every iframe that renders a storefront page.
 *
 * `color-scheme` is the half of this that is easy to miss. An embedded
 * document that sets no colours of its own — which is most merchant pages,
 * since a page with no body background is the normal starting point — takes
 * the OS preference, and on a machine in dark mode the UA paints it black
 * with white text. The merchant sees a black page in a light admin and has
 * nothing in their own design to blame.
 */
const PAGE_IFRAMES = [
  'admin/pages/site/canvas/IframeFrameSurface.module.css',
  'admin/pages/site/preview/PreviewOverlay.module.css',
  'admin/pages/site/panels/SiteExplorerPanel/SiteExplorerPanel.module.css',
]

describe('canvas page surface', () => {
  const globals = read('styles/globals.css')

  it('defines --canvas-page-bg exactly once', () => {
    expect(globals.match(/--canvas-page-bg\s*:/g)?.length ?? 0).toBe(1)
  })

  it('defines it before any theme block, so no theme can invert it', () => {
    // Everything after the first `[data-editor-theme=...]` selector is a
    // per-theme override. A page-sheet colour declared there would be exactly
    // the bug this gate exists to prevent.
    const declaration = globals.indexOf('--canvas-page-bg:')
    const firstThemeBlock = globals.indexOf('[data-editor-theme=')

    expect(declaration).toBeGreaterThan(-1)
    expect(firstThemeBlock).toBeGreaterThan(-1)
    expect(declaration).toBeLessThan(firstThemeBlock)
  })

  it.each(PAGE_SURFACES)('%s paints the page sheet, not an admin token', (path) => {
    const css = read(path)
      // Comments here explain the history and name the old token on purpose.
      .replace(/\/\*[\s\S]*?\*\//g, '')

    expect(css).toContain('var(--canvas-page-bg)')
    expect(css).not.toMatch(/background:\s*var\(--overlay\)/)
  })

  it.each(PAGE_IFRAMES)('%s pins its page iframe to a light color-scheme', (path) => {
    expect(read(path)).toMatch(/color-scheme:\s*light/)
  })
})
