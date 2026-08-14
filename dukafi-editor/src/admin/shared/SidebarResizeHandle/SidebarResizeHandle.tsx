import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from '@admin/state/workspaceLayout'
import styles from './SidebarResizeHandle.module.css'

const KEYBOARD_STEP = 10

type SidebarSide = 'left' | 'right'

interface SidebarResizeHandleProps {
  side: SidebarSide
  width: number
  targetRef: RefObject<HTMLElement | null>
  cssVariable: string
  layoutCssVariable?: string
  ariaLabel: string
  onResize: (width: number) => void
}

interface ResizeDragState {
  startClientX: number
  startWidth: number
}

function widthFromPointer(side: SidebarSide, drag: ResizeDragState, clientX: number) {
  const delta = side === 'left'
    ? clientX - drag.startClientX
    : drag.startClientX - clientX
  return clampSidebarWidth(drag.startWidth + delta)
}

function keyboardDelta(side: SidebarSide, key: string) {
  if (key === 'ArrowRight') return side === 'left' ? KEYBOARD_STEP : -KEYBOARD_STEP
  if (key === 'ArrowLeft') return side === 'left' ? -KEYBOARD_STEP : KEYBOARD_STEP
  return 0
}

export function SidebarResizeHandle({
  side,
  width,
  targetRef,
  cssVariable,
  layoutCssVariable,
  ariaLabel,
  onResize,
}: SidebarResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(clampSidebarWidth(width))
  const dragRef = useRef<ResizeDragState | null>(null)

  // useCallback kept: stable identity for the [applyLiveWidth] useEffect dep array (exhaustive-deps).
  const applyLiveWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampSidebarWidth(nextWidth)
    widthRef.current = clampedWidth
    const target = targetRef.current
    target?.style.setProperty(cssVariable, `${clampedWidth}px`)
    if (layoutCssVariable) target?.style.setProperty(layoutCssVariable, `${clampedWidth}px`)
    handleRef.current?.setAttribute('aria-valuenow', String(clampedWidth))
  }, [cssVariable, layoutCssVariable, targetRef])

  useEffect(() => {
    applyLiveWidth(width)
  }, [applyLiveWidth, width])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const startWidth = clampSidebarWidth(widthRef.current)
    dragRef.current = {
      startClientX: event.clientX,
      startWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    applyLiveWidth(widthFromPointer(side, dragRef.current, event.clientX))
  }

  const commitPointerResize = (clientX: number) => {
    if (!dragRef.current) return
    const nextWidth = widthFromPointer(side, dragRef.current, clientX)
    dragRef.current = null
    applyLiveWidth(nextWidth)
    onResize(nextWidth)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    commitPointerResize(event.clientX)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    commitPointerResize(event.clientX)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null

    if (event.key === 'Home') {
      nextWidth = SIDEBAR_MIN_WIDTH
    } else if (event.key === 'End') {
      nextWidth = SIDEBAR_MAX_WIDTH
    } else {
      const delta = keyboardDelta(side, event.key)
      if (delta !== 0) nextWidth = clampSidebarWidth(widthRef.current + delta)
    }

    if (nextWidth === null) return
    event.preventDefault()
    applyLiveWidth(nextWidth)
    onResize(nextWidth)
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={clampSidebarWidth(width)}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-label={ariaLabel}
      tabIndex={0}
      data-side={side}
      className={styles.handle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    />
  )
}
