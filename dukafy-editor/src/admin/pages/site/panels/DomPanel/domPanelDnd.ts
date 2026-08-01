import type { Page } from '@core/page-tree'
import {
  resolvePageTreeDropTarget,
  type PageTreeDropPosition,
  type PageTreeDropTarget,
} from '@core/page-tree'

type DomDropZone = PageTreeDropPosition

export type DomDropTarget = PageTreeDropTarget

interface DomDropRowRect {
  top: number
  bottom: number
  height: number
}

export interface DomDropRowMeta {
  nodeId: string
  rect: DomDropRowRect
}

interface ResolveDomDropTargetInput {
  page: Page
  /** The pivot id (the row the user grabbed). */
  draggedId: string
  /**
   * All ids being dragged. Optional — defaults to `[draggedId]` for
   * single-drag callers. Cycle and no-op checks consider every id in this
   * list; index normalization is computed against the pivot only.
   */
  draggedIds?: string[]
  overId: string
  zone: DomDropZone
  canHaveChildren: (moduleId: string) => boolean
}

const MIN_EDGE_HIT_ZONE = 8
const MAX_EDGE_HIT_ZONE = 12
const EDGE_ZONE_RATIO = 0.3

export function getDomDropZone(rect: DomDropRowRect, pointerY: number): DomDropZone {
  const edgeBand = Math.max(
    MIN_EDGE_HIT_ZONE,
    Math.min(MAX_EDGE_HIT_ZONE, rect.height * EDGE_ZONE_RATIO),
  )
  const offset = pointerY - rect.top

  if (offset <= edgeBand) return 'before'
  if (offset >= rect.height - edgeBand) return 'after'
  return 'inside'
}

export function findDomDropRow(rows: DomDropRowMeta[], pointerY: number): DomDropRowMeta | null {
  for (const row of rows) {
    if (pointerY >= row.rect.top && pointerY <= row.rect.bottom) return row
  }
  return null
}

export function resolveDomDropTarget({
  page,
  draggedId,
  draggedIds: draggedIdsInput,
  overId,
  zone,
  canHaveChildren,
}: ResolveDomDropTargetInput): DomDropTarget | null {
  return resolvePageTreeDropTarget({
    tree: page,
    draggedId,
    draggedIds: draggedIdsInput,
    overId,
    zone,
    canHaveChildren,
  })
}
