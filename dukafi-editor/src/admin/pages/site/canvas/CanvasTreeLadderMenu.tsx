import { useState, type RefObject } from 'react'
import { ContextMenu } from '@ui/components/ContextMenu'
import { selectActiveCanvasPage, useEditorStore } from '@site/store/store'
import type { StyleRuleRegistry } from '@core/page-tree'
import type { VisualComponent } from '@core/visualComponents'
import { CanvasTreeLadderRowButton } from './CanvasTreeLadderRowButton'
import {
  buildCanvasTreeLadderRows,
  commitCanvasTreeLadderSelection,
} from './canvasTreeLadder'
import styles from './BreakpointSelectionOverlay.module.css'

const EMPTY_STYLE_RULES: StyleRuleRegistry = {}
const EMPTY_VISUAL_COMPONENTS: readonly VisualComponent[] = []

interface CanvasTreeLadderMenuProps {
  anchorRef: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  nodeId: string
  onClose: () => void
}

export function CanvasTreeLadderMenu({
  anchorRef,
  triggerRef,
  nodeId,
  onClose,
}: CanvasTreeLadderMenuProps) {
  const activePage = useEditorStore(selectActiveCanvasPage)
  const activeBreakpointId = useEditorStore((s) => s.activeBreakpointId)
  const styleRules = useEditorStore((s) => s.site?.styleRules ?? EMPTY_STYLE_RULES)
  const visualComponents = useEditorStore((s) => s.site?.visualComponents ?? EMPTY_VISUAL_COMPONENTS)
  const [highlightedNodeId, setHighlightedNodeId] = useState(nodeId)

  const rows = buildCanvasTreeLadderRows(activePage, nodeId)
  const effectiveHighlightedNodeId = rows.some((row) => row.nodeId === highlightedNodeId)
    ? highlightedNodeId
    : rows.find((row) => row.relation === 'current')?.nodeId ?? rows[0]?.nodeId ?? nodeId

  const commitSelection = (nextNodeId: string) => {
    const state = useEditorStore.getState()
    commitCanvasTreeLadderSelection(state, nextNodeId, activeBreakpointId)
    onClose()
  }

  if (!activePage || rows.length === 0) return null

  return (
    <ContextMenu
      ariaLabel="Select parent or child layer"
      anchorRef={anchorRef}
      triggerRef={triggerRef}
      onClose={onClose}
      minWidth={236}
      width={236}
      maxHeight={340}
      side="bottom"
      align="start"
      offset={4}
      menuClassName={styles.treeLadderContextMenu}
    >
      <div className={styles.treeLadderRows}>
        {rows.map((row) => {
          const node = activePage.nodes[row.nodeId]
          if (!node) return null
          return (
            <CanvasTreeLadderRowButton
              key={`${row.nodeId}:${row.relation}`}
              row={row}
              node={node}
              highlighted={row.nodeId === effectiveHighlightedNodeId}
              styleRules={styleRules}
              visualComponents={visualComponents}
              role="menuitem"
              onHighlight={setHighlightedNodeId}
              onCommit={commitSelection}
            />
          )
        })}
      </div>
    </ContextMenu>
  )
}
