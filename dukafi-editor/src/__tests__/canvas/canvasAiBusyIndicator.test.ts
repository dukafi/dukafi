/**
 * The "assistant is working on THIS element" overlay.
 *
 * Rendering `BreakpointSelectionOverlay` needs the whole canvas context —
 * viewport refs, an iframe, permissions, a RAF measurement loop — so this file
 * follows the same source/CSS-assertion approach as
 * `contextSelectorLayering.test.ts` rather than mounting it.
 *
 * What is pinned here is what would break SILENTLY: the indicator sitting
 * outside the ring (and so needing its own measurement), a spinner in every
 * breakpoint frame at once, and a colour token that is not a colour.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'

const tsx = readFileSync(
  new URL('../../admin/pages/site/canvas/BreakpointSelectionOverlay.tsx', import.meta.url),
  'utf-8',
)
const css = readFileSync(
  new URL('../../admin/pages/site/canvas/BreakpointSelectionOverlay.module.css', import.meta.url),
  'utf-8',
)

describe('AI busy indicator', () => {
  // Nested inside the ring, it inherits the rect the RAF tick already measures.
  // Lifted out, it would need a second measurement path that could drift from
  // the first at any zoom level.
  it('renders inside the selection ring rather than beside it', () => {
    const ringBlock = tsx.slice(
      tsx.indexOf('data-canvas-selection-ring'),
      tsx.indexOf('data-canvas-hover-ring'),
    )

    expect(ringBlock).toContain('styles.aiBusy')
    // A self-closing ring element cannot contain the indicator.
    expect(ringBlock).toContain('</div>')
  })

  // Every breakpoint frame renders its own rings; without this gate a
  // three-frame canvas spins three times for one request.
  it('shows only in the active breakpoint frame', () => {
    expect(tsx).toMatch(/const aiBusy = aiPending && activeBreakpointId === breakpointId/)
  })

  // `--canvas-selection-ring` is a box-shadow VALUE (`inset 0 0 0 1px #39ff14`),
  // not a colour. Using it where a colour is expected is silently ignored by
  // the browser, so the spinner would simply have no visible arc.
  it('uses the ring colour token, not the box-shadow token', () => {
    const busy = css.slice(css.indexOf('.aiBusy'))

    expect(busy).toContain('--canvas-selection-ring-color')
    expect(busy).not.toMatch(/var\(--canvas-selection-ring\)/)
  })

  // ...and conversely, the ring itself still needs the shadow token.
  it('leaves the selection ring on the box-shadow token', () => {
    expect(css).toMatch(/box-shadow:\s*var\(--canvas-selection-ring\)/)
  })

  it('fills the selected element and cannot swallow clicks', () => {
    const busy = css.slice(css.indexOf('.aiBusy'), css.indexOf('.aiBusySpinner'))

    expect(busy).toContain('inset: 0')
    expect(busy).toContain('pointer-events: none')
    // A tall element would otherwise let the spinner escape its own ring.
    expect(busy).toContain('overflow: hidden')
  })

  it('stops animating for reduced motion', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'))

    expect(reduced).toContain('.aiBusySpinner')
    expect(reduced).toContain('animation: none')
  })
})
