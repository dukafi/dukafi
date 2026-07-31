import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'

describe('CanvasContextSelector labels', () => {
  const source = readFileSync(
    new URL('../../admin/pages/site/canvas/CanvasContextSelector.tsx', import.meta.url),
    'utf-8',
  )

  it('uses author-facing context labels instead of exposing breakpoint/media as peers', () => {
    expect(source).toContain("label: 'Viewport'")
    expect(source).toContain("label: 'Environment'")
    expect(source).not.toContain("label: 'Breakpoint'")
  })
})
