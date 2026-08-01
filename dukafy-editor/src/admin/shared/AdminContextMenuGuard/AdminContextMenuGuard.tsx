import { useEffect, useState, type CSSProperties } from 'react'
import { WarningDiamondSolidIcon } from 'pixel-art-icons/icons/warning-diamond-solid'
import styles from './AdminContextMenuGuard.module.css'

interface FlashState {
  id: number
  x: number
  y: number
}

function targetIsInsideAppMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('[role="menu"]') !== null
}

export function AdminContextMenuGuard() {
  const [flash, setFlash] = useState<FlashState | null>(null)

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (event.defaultPrevented) return

      event.preventDefault()
      if (targetIsInsideAppMenu(event.target)) return

      setFlash((current) => ({
        id: (current?.id ?? 0) + 1,
        x: event.clientX,
        y: event.clientY,
      }))
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  if (flash === null) return null

  const style = {
    '--admin-context-menu-flash-x': `${flash.x}px`,
    '--admin-context-menu-flash-y': `${flash.y}px`,
  } as CSSProperties

  return (
    <span
      key={flash.id}
      role="status"
      aria-label="No context menu available"
      className={styles.flash}
      style={style}
      onAnimationEnd={() => setFlash(null)}
    >
      <WarningDiamondSolidIcon size={16} aria-hidden="true" />
    </span>
  )
}
