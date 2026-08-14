/**
 * ZoomControls — toolbar controls for canvas zoom.
 *
 *   [Zoom -] [%] [Zoom +]
 *
 * Zooming +/− anchors around the canvas viewport center so the visible content
 * scales around the middle of the screen instead of the document's top-left.
 *
 * Live mode: the single real-size frame always renders at 100%, so the
 * controls show 100% and are disabled with the reason in their tooltip —
 * never an interactive control that silently does nothing. (Wheel/keyboard
 * zoom is already gated off in live mode by useCanvas's `enabled` flag.)
 *
 * Performance: subscribes only to `zoom` — no re-render when
 * other canvas state changes.
 *
 * Keyboard shortcuts (handled in useCanvas, documented here for screen readers):
 *   +/= → zoom in
 *   -   → zoom out
 *   Cmd/Ctrl+0 → reset to 100%
 *   Shift+1 → reset to 100% (legacy muscle-memory)
 */

import { useEditorStore } from '@site/store/store'
import { MinusIcon } from 'pixel-art-icons/icons/minus'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { Button } from '@ui/components/Button'
import styles from './Toolbar.module.css'

/**
 * Resolve the canvas viewport center in canvas-local coordinates.
 * Returns `null` if the canvas root isn't mounted (e.g. before first render).
 *
 * The canvas root is queried by data-testid because ZoomControls lives in the
 * toolbar (a sibling of the canvas), not inside CanvasRoot — passing a ref
 * would require threading it through several layers of layout components for
 * a one-off geometry lookup at click time.
 */
function getCanvasCenter(): { x: number; y: number } | null {
  const el = document.querySelector('[data-testid="canvas-root"]')
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.width / 2, y: rect.height / 2 }
}

export function ZoomControls() {
  // Subscribe only to zoom — no re-render when other canvas state changes
  const zoom = useEditorStore((s) => s.zoom)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const resetView = useEditorStore((s) => s.resetView)

  const handleZoomIn = () => {
    const center = getCanvasCenter()
    if (center) zoomIn(center.x, center.y)
    else zoomIn()
  }

  const handleZoomOut = () => {
    const center = getCanvasCenter()
    if (center) zoomOut(center.x, center.y)
    else zoomOut()
  }

  const pct = Math.round(zoom * 100)

  return (
    <div
      role="group"
      aria-label="Canvas navigation"
      data-testid="toolbar-zoom-controls"
      className={styles.zoomGroup}
    >
      {/* Zoom out */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom out"
        aria-keyshortcuts="-"
        tooltip="Zoom out (−)"
        onClick={handleZoomOut}
      >
        <MinusIcon size={14} />
      </Button>

      {/* Zoom % display — click to reset to 100% */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Current zoom ${pct}%. Click to reset to 100%.`}
        tooltip="Reset to 100% (Cmd/Ctrl+0)"
        onClick={resetView}
        numeric
        className={styles.zoomPct}
      >
        {pct}%
      </Button>

      {/* Zoom in */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Zoom in"
        aria-keyshortcuts="="
        tooltip="Zoom in (+)"
        onClick={handleZoomIn}
      >
        <PlusIcon size={14} />
      </Button>
    </div>
  )
}
