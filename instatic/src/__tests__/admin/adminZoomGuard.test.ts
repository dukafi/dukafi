import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { installAdminZoomGuard } from '@admin/shared/AdminZoomGuard'

const GLOBALS_CSS_PATH = join(import.meta.dir, '../../styles/globals.css')

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
})

function dispatchCancelableDocumentEvent(type: string, props: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true })
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { configurable: true, value })
  }
  document.dispatchEvent(event)
  return event
}

describe('AdminZoomGuard', () => {
  it('prevents browser zoom gestures across the admin document', () => {
    cleanup = installAdminZoomGuard(document)

    expect(dispatchCancelableDocumentEvent('wheel', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(dispatchCancelableDocumentEvent('wheel', { metaKey: true }).defaultPrevented).toBe(true)
    expect(dispatchCancelableDocumentEvent('gesturestart').defaultPrevented).toBe(true)
    expect(dispatchCancelableDocumentEvent('gesturechange').defaultPrevented).toBe(true)
    expect(dispatchCancelableDocumentEvent('touchmove', { touches: [{}, {}] }).defaultPrevented).toBe(true)
  })

  it('leaves ordinary wheel and one-finger touch scrolling alone', () => {
    cleanup = installAdminZoomGuard(document)

    expect(dispatchCancelableDocumentEvent('wheel').defaultPrevented).toBe(false)
    expect(dispatchCancelableDocumentEvent('touchmove', { touches: [{}] }).defaultPrevented).toBe(false)
  })

  it('disables native pinch zoom in the admin root while allowing touch pan', () => {
    const globalsCss = readFileSync(GLOBALS_CSS_PATH, 'utf8')

    expect(globalsCss).toMatch(/html,\s*body,\s*#root\s*\{[^}]*touch-action:\s*pan-x pan-y;/s)
  })
})
