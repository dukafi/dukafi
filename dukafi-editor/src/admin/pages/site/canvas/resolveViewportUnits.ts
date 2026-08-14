/**
 * resolveViewportUnits — pin CSS viewport-length units to fixed pixels for the
 * canvas iframes.
 *
 * Why this exists
 * ───────────────
 * Each breakpoint frame is an `<iframe>` whose height tracks its content
 * (grow-to-content, no inner scrollbar — see `IframeFrameSurface`). Inside an
 * iframe, the height-relative viewport units (`vh`, `vb`, `vmin`, `vmax`, and
 * the small/large/dynamic variants) are measured against the iframe's OWN
 * height. So authored CSS like `min-height: 100vh` feeds straight back into the
 * height the frame is growing to: we size the frame from its content → `vh`
 * recomputes larger → content grows → the frame grows again. The frame
 * explodes to tens of thousands of pixels (a `88vh` hero measured ~32,000px),
 * and once the imported page fills those frames the editor lags until the tab
 * crashes.
 *
 * Width-relative units (`vw`, `vi`, …) are already correct in the canvas — the
 * iframe's width is fixed to the breakpoint width and never derived from
 * content — but we resolve every viewport unit uniformly so mixed units
 * (`vmin`/`vmax`) stay dimensionally consistent.
 *
 * Resolving the units to a fixed device viewport (width = the breakpoint width,
 * height = `CANVAS_VIEWPORT_HEIGHT`) breaks the feedback loop entirely: content
 * height no longer depends on frame height, so the frame settles at the real
 * content height in a single pass, and `vh` renders at a sane, device-like
 * size.
 *
 * This is a CANVAS-ONLY transform. The published page is untouched — it keeps
 * real viewport units, resolved against the visitor's real browser viewport.
 * Only numeric unit *values* change; selectors are never touched, so CSS
 * combinators and structural pseudo-classes keep matching the same elements.
 *
 * Writing mode: `vi`/`vb` are treated as inline = horizontal (width) and
 * block = vertical (height), i.e. the default `horizontal-tb` writing mode.
 * Vertical-writing-mode pages would resolve these to the swapped axis; that
 * trade-off is acceptable for a canvas preview and keeps the transform a pure
 * string pass with no layout dependency.
 */

/**
 * Representative device viewport height (px) that height-relative viewport
 * units resolve against in the canvas. ~800px matches a typical laptop/phone
 * viewport across every breakpoint width, so `100vh` previews at a believable
 * device height instead of the grown frame height.
 */
export const CANVAS_VIEWPORT_HEIGHT = 800

export interface CanvasViewport {
  /** Frame width in px — the basis for width-relative units (`vw`, `vi`). */
  width: number
  /** Frame viewport height in px — the basis for height-relative units. */
  height: number
}

// Single-pass scanner. The leading branches consume regions where a
// `<number><unit>` pattern must NOT be rewritten — block comments, quoted
// strings, and `url(...)` tokens — and are passed through verbatim. The final
// branch captures an actual viewport-unit length: a number (group 1) followed
// by a unit (group 2), guarded so it can't match inside an identifier
// (`.h100vh`) or a longer unit/number tail.
//
// Unit alternation is ordered longest-first so e.g. `vmin` wins over `vi`.
const VIEWPORT_UNIT_SCAN =
  /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\((?:[^)\\]|\\.)*\)|(?<![\w.#-])(-?(?:\d*\.\d+|\d+))(svmin|lvmin|dvmin|svmax|lvmax|dvmax|vmin|vmax|svw|lvw|dvw|svh|lvh|dvh|svi|lvi|dvi|svb|lvb|dvb|vw|vh|vi|vb)(?![\w%-])/gi

function unitBasisPx(unit: string, viewport: CanvasViewport): number {
  switch (unit.toLowerCase()) {
    case 'vw':
    case 'svw':
    case 'lvw':
    case 'dvw':
    case 'vi':
    case 'svi':
    case 'lvi':
    case 'dvi':
      return viewport.width
    case 'vmin':
    case 'svmin':
    case 'lvmin':
    case 'dvmin':
      return Math.min(viewport.width, viewport.height)
    case 'vmax':
    case 'svmax':
    case 'lvmax':
    case 'dvmax':
      return Math.max(viewport.width, viewport.height)
    // vh / vb and small/large/dynamic variants — height axis.
    default:
      return viewport.height
  }
}

/**
 * Rewrite every CSS viewport-length unit in `css` to a fixed `px` value based
 * on `viewport`. Comments, strings, and `url()` tokens are left untouched.
 */
export function resolveViewportUnitsForCanvas(css: string, viewport: CanvasViewport): string {
  if (!css) return css
  return css.replace(VIEWPORT_UNIT_SCAN, (match, num: string | undefined, unit: string | undefined) => {
    // Protected region (comment / string / url) — group captures are undefined.
    if (num === undefined || unit === undefined) return match
    const px = (parseFloat(num) / 100) * unitBasisPx(unit, viewport)
    // Trim float noise: keep up to 3 decimals, drop trailing zeros.
    return `${parseFloat(px.toFixed(3))}px`
  })
}
