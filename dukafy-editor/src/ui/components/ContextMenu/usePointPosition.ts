import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { useEvent } from '@ui/lib/useEvent'

interface PointPosition {
  x: number
  y: number
}

interface UsePointPositionParams {
  /** Present in anchor mode; this hook is a no-op when set. */
  anchorRef: RefObject<HTMLElement | null> | undefined
  /** Ref to the menu element being positioned (measured for viewport-fit). */
  menuRef: RefObject<HTMLDivElement | null>
  /** Click-point coordinates (viewport pixels). */
  pointX: number | undefined
  pointY: number | undefined
  /** Render width the CSS applies (used in flip/clamp math). */
  effectiveWidth: number
  maxHeight: number | undefined
}

interface UsePointPositionResult {
  /** Viewport-clamped position, or `null` until the menu has been measured. */
  position: PointPosition | null
}

/**
 * Point-anchored viewport-fit positioning for {@link ContextMenu}.
 *
 * In point mode (right-click `x`/`y`) the menu measures itself once after
 * mount and shifts the click point so the panel never overflows the viewport:
 * flip horizontally when it would cross the right edge, flip vertically when it
 * would cross the bottom edge, then clamp to the 8px viewport margin. Until
 * measured, `position` is `null` and the caller renders the panel hidden.
 *
 * No-op (returns `position: null`) when `anchorRef` is present — the menu is
 * then in anchor mode (see {@link useAnchorPosition}).
 */
export function usePointPosition({
  anchorRef,
  menuRef,
  pointX,
  pointY,
  effectiveWidth,
  maxHeight,
}: UsePointPositionParams): UsePointPositionResult {
  const [position, setPosition] = useState<PointPosition | null>(null)

  // Measure once after mount and flip/clamp so the panel stays inside the
  // viewport. The "flip around the click point" behaviour is the right-click
  // convention: when the menu would overflow the right edge, position it so its
  // right edge sits at the click x (i.e. the menu opens to the LEFT of the
  // click); same for the bottom edge.
  const recompute = useEvent(() => {
    if (anchorRef) return
    if (pointX == null || pointY == null) return
    const menuEl = menuRef.current
    if (!menuEl) return
    const menuRect = menuEl.getBoundingClientRect()
    const effectiveHeight = maxHeight != null
      ? Math.min(menuRect.height, maxHeight)
      : menuRect.height
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    let x = pointX
    let y = pointY
    if (x + effectiveWidth > vw - margin) {
      // Flip horizontally: align right edge of menu with click point. Then
      // clamp to keep the left edge inside the viewport for the case where
      // the menu is wider than the click point itself.
      x = Math.max(margin, pointX - effectiveWidth)
    }
    if (y + effectiveHeight > vh - margin) {
      y = Math.max(margin, pointY - effectiveHeight)
    }
    // Final clamp — covers the (rare) case where the menu is larger than the
    // viewport in either dimension. Never push the menu past the right / bottom
    // edge; never above / left of the margin.
    x = Math.max(margin, Math.min(x, vw - effectiveWidth - margin))
    y = Math.max(margin, Math.min(y, vh - effectiveHeight - margin))
    setPosition({ x, y })
  })

  useLayoutEffect(() => {
    if (anchorRef) return
    recompute()
    // `pointX`/`pointY` are deps so reopening the menu at a different
    // coordinate (the typical right-click flow) re-measures and re-flips.
  }, [anchorRef, pointX, pointY, recompute])

  // Re-run the flip/clamp math whenever the menu's own measured size changes —
  // content that loads after the first measuring frame (async-populated menus)
  // would otherwise overflow the viewport past the bottom/right edge it was
  // clamped against while still short.
  useLayoutEffect(() => {
    if (anchorRef) return
    const menuEl = menuRef.current
    if (!menuEl || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => recompute())
    observer.observe(menuEl)
    return () => observer.disconnect()
  }, [anchorRef, menuRef, recompute])

  useEffect(() => {
    if (anchorRef) return
    function onViewportChange() {
      recompute()
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [anchorRef, recompute])

  return { position }
}
