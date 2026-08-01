/**
 * Unit tests for `clientPointToEditorDoc` — translates a pointer event's
 * coordinates from the iframe-internal viewport into editor-document
 * coordinates.
 *
 * Regression gate for the right-click context menu being positioned at the
 * wrong screen location: the menu is portaled into the editor's
 * `document.body` with `position: fixed`, so events fired inside a canvas
 * iframe must have their `clientX/clientY` translated by the iframe's outer
 * rect (and the canvas zoom) before driving the menu's `x` / `y` props.
 */

import { describe, it, expect } from 'bun:test'
import { clientPointToEditorDoc } from '@site/canvas/canvasDomGeometry'

/**
 * Build a fake event that pretends to originate inside an iframe whose
 * client rect is at `(iframeLeft, iframeTop)` with size `outerWidth × outerHeight`.
 * The iframe element's `offsetWidth` reflects the laid-out (un-transformed)
 * width; `clientRect.width` reflects the post-transform width — their ratio
 * recovers the canvas zoom.
 */
function makeEventInIframe(
  clientX: number,
  clientY: number,
  iframe: {
    rectLeft: number
    rectTop: number
    rectWidth: number
    rectHeight: number
    offsetWidth: number
  } | null,
) {
  const frameElement = iframe
    ? ({
        offsetWidth: iframe.offsetWidth,
        getBoundingClientRect() {
          return {
            left: iframe.rectLeft,
            top: iframe.rectTop,
            right: iframe.rectLeft + iframe.rectWidth,
            bottom: iframe.rectTop + iframe.rectHeight,
            width: iframe.rectWidth,
            height: iframe.rectHeight,
          } as DOMRect
        },
      } as unknown as HTMLIFrameElement)
    : null
  const target = {
    ownerDocument: {
      defaultView: { frameElement },
    },
  } as unknown as EventTarget
  return { clientX, clientY, target }
}

describe('clientPointToEditorDoc', () => {
  it('returns clientX/clientY unchanged when the event has no iframe ancestor', () => {
    const event = makeEventInIframe(120, 80, null)
    expect(clientPointToEditorDoc(event)).toEqual({ x: 120, y: 80 })
  })

  it('returns clientX/clientY unchanged when target has no ownerDocument', () => {
    const event = { clientX: 50, clientY: 70, target: null }
    expect(clientPointToEditorDoc(event)).toEqual({ x: 50, y: 70 })
  })

  it('adds the iframe outer rect for an iframe at 1× zoom', () => {
    // iframe sitting at (300, 100) in the editor doc, unscaled (offsetWidth
    // matches rect width). A click at (40, 60) inside the iframe lands at
    // (340, 160) in the editor doc.
    const event = makeEventInIframe(40, 60, {
      rectLeft: 300,
      rectTop: 100,
      rectWidth: 800,
      rectHeight: 600,
      offsetWidth: 800,
    })
    expect(clientPointToEditorDoc(event)).toEqual({ x: 340, y: 160 })
  })

  it('multiplies the iframe-internal point by the canvas zoom', () => {
    // Same iframe but the canvas transform layer has scaled it down to 50%:
    // offsetWidth = 800, but clientRect.width = 400. iframeScale = 0.5.
    // A click at (200, 100) inside the iframe should land at:
    //   x = 300 + 200 * 0.5 = 400
    //   y = 100 + 100 * 0.5 = 150
    const event = makeEventInIframe(200, 100, {
      rectLeft: 300,
      rectTop: 100,
      rectWidth: 400,
      rectHeight: 300,
      offsetWidth: 800,
    })
    expect(clientPointToEditorDoc(event)).toEqual({ x: 400, y: 150 })
  })

  it('falls back to scale=1 when iframe.offsetWidth is 0 (defensive)', () => {
    // Detached iframes can briefly report offsetWidth = 0; we must not divide
    // by zero. The translation in that case is just the outer offset.
    const event = makeEventInIframe(50, 50, {
      rectLeft: 100,
      rectTop: 200,
      rectWidth: 400,
      rectHeight: 300,
      offsetWidth: 0,
    })
    expect(clientPointToEditorDoc(event)).toEqual({ x: 150, y: 250 })
  })
})
