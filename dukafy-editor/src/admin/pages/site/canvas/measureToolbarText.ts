/**
 * measureToolbarValueWidth — pixel width of a floating-toolbar value label.
 *
 * The template / VC toolbar selects size their trigger to the selected text so
 * there's no dead space before the chevron. A `ch`-based estimate overshoots a
 * proportional font, so we measure the real rendered width with a canvas 2D
 * context using the toolbar's actual value font (`700 12px var(--font-sans)`).
 */

let measureCanvas: HTMLCanvasElement | null = null
let cachedFont: string | null = null

function triggerFont(): string {
  if (cachedFont) return cachedFont
  const sans = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
  cachedFont = `700 12px ${sans || 'sans-serif'}`
  return cachedFont
}

/** Measured width (px, rounded up) of `text` in the toolbar value font. */
export function measureToolbarValueWidth(text: string): number {
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = triggerFont()
  return Math.ceil(ctx.measureText(text).width)
}
