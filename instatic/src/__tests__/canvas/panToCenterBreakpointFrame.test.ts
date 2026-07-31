/**
 * Unit tests for `panToCenterBreakpointFrame` — computes the pan offset that
 * horizontally centers a breakpoint frame in the canvas viewport and aligns its
 * top a fixed padding below the viewport top, keeping the current zoom.
 *
 * Regression gate for the "Default viewport" preference: opening a site must
 * focus the chosen frame rather than always landing on the left-most (mobile)
 * frame. The preference sets `activeBreakpointId`, and the canvas pans to that
 * frame using this geometry on first load.
 */

import { describe, it, expect } from 'bun:test'
import { panToCenterBreakpointFrame } from '@site/canvas/canvasDomGeometry'

/** Build a fake element whose `getBoundingClientRect()` returns the given box. */
function elementWithRect(box: {
  left: number
  top: number
  width: number
  height: number
}): HTMLElement {
  return {
    getBoundingClientRect() {
      return {
        left: box.left,
        top: box.top,
        right: box.left + box.width,
        bottom: box.top + box.height,
        width: box.width,
        height: box.height,
      } as DOMRect
    },
  } as unknown as HTMLElement
}

describe('panToCenterBreakpointFrame', () => {
  it('returns null when the frame is not laid out yet (zero-size)', () => {
    const root = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 })
    const frame = elementWithRect({ left: 0, top: 0, width: 0, height: 0 })
    expect(panToCenterBreakpointFrame(root, frame, { panX: 0, panY: 0 })).toBeNull()
  })

  it('shifts pan so the frame center aligns with the viewport center horizontally', () => {
    // Root viewport spans [0, 1000] → center X = 500.
    // Frame at left=0 width=375 → center X = 187.5. It must move right by
    // 500 - 187.5 = 312.5.
    const root = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 })
    const frame = elementWithRect({ left: 0, top: 100, width: 375, height: 600 })
    const result = panToCenterBreakpointFrame(root, frame, { panX: 0, panY: 0 })
    expect(result?.panX).toBeCloseTo(312.5)
  })

  it('aligns the frame top a fixed padding below the viewport top', () => {
    // Frame top is at 100, viewport top at 0, default padding 48 → the frame
    // must move up by 100 - 48 = 52 (panY delta of -52).
    const root = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 })
    const frame = elementWithRect({ left: 0, top: 100, width: 375, height: 600 })
    const result = panToCenterBreakpointFrame(root, frame, { panX: 0, panY: 0 })
    expect(result?.panY).toBeCloseTo(-52)
  })

  it('honours a custom top padding', () => {
    const root = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 })
    const frame = elementWithRect({ left: 0, top: 100, width: 375, height: 600 })
    const result = panToCenterBreakpointFrame(root, frame, { panX: 0, panY: 0 }, 20)
    // desired top 20, current top 100 → delta -80.
    expect(result?.panY).toBeCloseTo(-80)
  })

  it('is relative to the current pan (adds the delta, not replaces)', () => {
    // Same geometry as the centering test but starting from a non-zero pan.
    const root = elementWithRect({ left: 0, top: 0, width: 1000, height: 800 })
    const frame = elementWithRect({ left: 0, top: 100, width: 375, height: 600 })
    const result = panToCenterBreakpointFrame(root, frame, { panX: 200, panY: 50 })
    expect(result?.panX).toBeCloseTo(200 + 312.5)
    expect(result?.panY).toBeCloseTo(50 - 52)
  })

  it('accounts for a non-zero viewport offset (panel-shifted canvas root)', () => {
    // Canvas root starts at left=300 (left panel) → center X = 300 + 350 = 650.
    // Frame center X = 300 + 187.5 = 487.5 → delta = 162.5.
    const root = elementWithRect({ left: 300, top: 0, width: 700, height: 800 })
    const frame = elementWithRect({ left: 300, top: 0, width: 375, height: 600 })
    const result = panToCenterBreakpointFrame(root, frame, { panX: 0, panY: 0 })
    expect(result?.panX).toBeCloseTo(162.5)
    // Frame top equals root top (0); desired top is 48 → move down by 48.
    expect(result?.panY).toBeCloseTo(48)
  })
})
