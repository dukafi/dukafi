import { useCallback, useEffect, useState, type RefObject } from 'react'

export type MenuPlacement = 'bottom-start' | 'left-start'

export interface MenuSizing {
  width: number
  minWidth: number
}

interface UseSelectMenuAnchorArgs {
  open: boolean
  menuPlacement: MenuPlacement
  menuAnchorRef: RefObject<HTMLElement | null> | undefined
  menuMinWidth: number | undefined
  selectRef: RefObject<HTMLDivElement | null>
}

interface UseSelectMenuAnchorResult {
  menuSizing: MenuSizing | null
  getAnchorRect: () => DOMRect | null
  updateMenuSizing: () => void
  clearMenuSizing: () => void
}

/**
 * Encapsulates dropdown sizing + anchor-rect math.
 *
 * Width comes from the wider parent when `menuAnchorRef` is supplied (so long
 * option labels stay readable past a narrow trigger cell); vertical position
 * always tracks the trigger so the menu opens directly below it. `left-start`
 * placement opts out and uses the trigger rect for both axes.
 */
export function useSelectMenuAnchor({
  open,
  menuPlacement,
  menuAnchorRef,
  menuMinWidth,
  selectRef,
}: UseSelectMenuAnchorArgs): UseSelectMenuAnchorResult {
  const [menuSizing, setMenuSizing] = useState<MenuSizing | null>(null)

  const getAnchorRect = (): DOMRect | null => {
    const triggerRect = selectRef.current?.getBoundingClientRect()
    if (!triggerRect) return null
    if (menuPlacement === 'left-start' || !menuAnchorRef?.current) {
      return triggerRect
    }
    const wideRect = menuAnchorRef.current.getBoundingClientRect()
    const left = wideRect.left
    const right = wideRect.right
    const width = wideRect.width
    const top = triggerRect.top
    const bottom = triggerRect.bottom
    const height = triggerRect.height
    return {
      left,
      right,
      width,
      top,
      bottom,
      height,
      x: left,
      y: top,
      toJSON() {
        return { left, right, width, top, bottom, height, x: left, y: top }
      },
    } as DOMRect
  }

  // Exception #1: referenced in the useEffect dep array below; exhaustive-deps needs a stable identity.
  const updateMenuSizing = useCallback(() => {
    const widthAnchor =
      menuPlacement !== 'left-start' && menuAnchorRef?.current
        ? menuAnchorRef.current
        : selectRef.current
    if (!widthAnchor) return
    const anchorRect = widthAnchor.getBoundingClientRect()
    const resolvedMinWidth = menuMinWidth ?? anchorRect.width
    const resolvedWidth = Math.max(anchorRect.width, resolvedMinWidth)
    setMenuSizing({ width: resolvedWidth, minWidth: resolvedMinWidth })
  }, [menuAnchorRef, menuMinWidth, menuPlacement, selectRef])

  const clearMenuSizing = () => {
    setMenuSizing(null)
  }

  useEffect(() => {
    if (!open) return
    function handleViewportChange() {
      updateMenuSizing()
    }
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuSizing])

  return { menuSizing, getAnchorRect, updateMenuSizing, clearMenuSizing }
}
