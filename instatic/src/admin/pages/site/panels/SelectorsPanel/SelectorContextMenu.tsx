import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '@ui/components/ContextMenu'
import { CloseIcon } from 'pixel-art-icons/icons/close'
import { Copy2SharpIcon } from 'pixel-art-icons/icons/copy-2-sharp'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { PaintBucketSolidIcon } from 'pixel-art-icons/icons/paint-bucket-solid'

interface SelectorContextMenuProps {
  x: number
  y: number
  selectedNodeHasClass: boolean
  selectedNodeId: string | null
  assignable: boolean
  onClose: () => void
  onEdit: () => void
  onRename: () => void
  onDuplicate: () => void
  onApply: () => void
  onRemove: () => void
  onCopy: () => void
  onDelete: () => void
  locked: boolean
}

export function SelectorContextMenu({
  x,
  y,
  selectedNodeHasClass,
  selectedNodeId,
  assignable,
  onClose,
  onEdit,
  onRename,
  onDuplicate,
  onApply,
  onRemove,
  onCopy,
  onDelete,
  locked,
}: SelectorContextMenuProps) {
  return (
    <ContextMenu x={x} y={y} ariaLabel="Selector actions" animateExit onClose={onClose}>
      <ContextMenuItem onClick={onEdit}>
        <span aria-hidden="true"><EditSolidIcon size={13} /></span>
        {locked ? 'View utility' : 'Edit'}
      </ContextMenuItem>
      <ContextMenuItem disabled={locked} onClick={onRename}>
        <span aria-hidden="true"><EditSolidIcon size={13} /></span>
        Rename
      </ContextMenuItem>
      <ContextMenuItem disabled={locked} onClick={onDuplicate}>
        <span aria-hidden="true"><Copy2SharpIcon size={13} /></span>
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!assignable || !selectedNodeId || selectedNodeHasClass} onClick={onApply}>
        <span aria-hidden="true"><PaintBucketSolidIcon size={13} /></span>
        Apply to selected element
      </ContextMenuItem>
      <ContextMenuItem disabled={!assignable || !selectedNodeId || !selectedNodeHasClass} onClick={onRemove}>
        <span aria-hidden="true"><CloseIcon size={13} /></span>
        Remove from selected element
      </ContextMenuItem>
      <ContextMenuItem onClick={onCopy}>
        <span aria-hidden="true"><Copy2SharpIcon size={13} /></span>
        Copy selector
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem danger disabled={locked} onClick={onDelete}>
        <span aria-hidden="true"><TrashSolidIcon size={13} /></span>
        Delete
      </ContextMenuItem>
    </ContextMenu>
  )
}
