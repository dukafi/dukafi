import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@ui/components/ContextMenu'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import { ChevronUpIcon } from 'pixel-art-icons/icons/chevron-up'
import { Copy2SharpIcon } from 'pixel-art-icons/icons/copy-2-sharp'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'

interface ColorTokenContextMenuProps {
  x: number
  y: number
  canMoveUp: boolean
  canMoveDown: boolean
  onClose: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

export function ColorTokenContextMenu({
  x,
  y,
  canMoveUp,
  canMoveDown,
  onClose,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: ColorTokenContextMenuProps) {
  return (
    <ContextMenu x={x} y={y} ariaLabel="Color token actions" animateExit onClose={onClose}>
      <ContextMenuItem onClick={onDuplicate}>
        <span aria-hidden="true">
          <Copy2SharpIcon size={13} />
        </span>
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
        <span aria-hidden="true">
          <ChevronUpIcon size={13} />
        </span>
        Move up
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
        <span aria-hidden="true">
          <ChevronDownIcon size={13} />
        </span>
        Move down
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem danger onClick={onDelete}>
        <span aria-hidden="true">
          <TrashSolidIcon size={13} />
        </span>
        Remove
      </ContextMenuItem>
    </ContextMenu>
  )
}
