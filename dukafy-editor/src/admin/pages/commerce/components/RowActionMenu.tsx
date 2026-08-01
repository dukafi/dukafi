/**
 * RowActionMenu — overflow menu for `DataTable` rows. Mirrors
 * `users/components/RowActionMenu.tsx` — see that file for the fuller
 * rationale; kept as a separate page-local copy per this codebase's
 * convention of small per-workspace UI helpers.
 */
import { useRef, useState } from 'react'
import { Button } from '@ui/components/Button'
import { ContextMenu, ContextMenuItem } from '@ui/components/ContextMenu'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import type { RowActionMenuItem } from '../types'

interface RowActionMenuProps {
  triggerLabel: string
  menuLabel: string
  disabled?: boolean
  items: RowActionMenuItem[]
}

export function RowActionMenu({ triggerLabel, menuLabel, disabled = false, items }: RowActionMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (items.length === 0) return null

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="xs"
        iconOnly
        disabled={disabled}
        active={open}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDownIcon size={14} aria-hidden="true" />
      </Button>
      {open && (
        <ContextMenu
          ariaLabel={menuLabel}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          side="bottom"
          align="end"
          width={176}
        >
          {items.map((item) => (
            <ContextMenuItem
              key={item.label}
              danger={item.danger}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </ContextMenuItem>
          ))}
        </ContextMenu>
      )}
    </>
  )
}
