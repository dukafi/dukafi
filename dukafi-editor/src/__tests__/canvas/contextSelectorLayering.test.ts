import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'

function cssRule(css: string, selector: string): string {
  return css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? ''
}

function zIndexForRule(rule: string): number {
  const value = rule.match(/z-index:\s*(\d+)/)?.[1]
  if (!value) throw new Error(`Expected z-index in CSS rule:\n${rule}`)
  return Number(value)
}

describe('CanvasContextSelector layering', () => {
  it('renders above in-canvas editing toolbars', () => {
    const contextSelectorCss = readFileSync(
      new URL('../../admin/pages/site/canvas/CanvasContextSelector.module.css', import.meta.url),
      'utf-8',
    )
    const selectionOverlayCss = readFileSync(
      new URL('../../admin/pages/site/canvas/BreakpointSelectionOverlay.module.css', import.meta.url),
      'utf-8',
    )

    const contextSelectorZIndex = zIndexForRule(cssRule(contextSelectorCss, '.shell'))
    const selectionToolbarZIndex = zIndexForRule(cssRule(selectionOverlayCss, '.selectionToolbar'))

    expect(contextSelectorZIndex).toBeGreaterThan(selectionToolbarZIndex)
  })
})
