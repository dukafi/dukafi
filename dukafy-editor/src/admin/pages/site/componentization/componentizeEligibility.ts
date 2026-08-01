import type { PageNode } from '@core/page-tree'
import type { ActiveDocument } from '@site/store/slices/uiSlice'

export function canComponentizeNode(
  activeDocument: ActiveDocument | null,
  node: PageNode | null | undefined,
): node is PageNode {
  return (
    activeDocument?.kind !== 'visualComponent' &&
    !!node &&
    node.moduleId !== 'base.body' &&
    node.moduleId !== 'base.visual-component-ref'
  )
}
