/**
 * Blocks — import a structured subtree into the page being edited.
 *
 * The subtree sibling of page import. A block file is JSON (see
 * `@core/page-tree/blockTransfer`) carrying a set of nodes and the style rules
 * they reference, so a merchant can hand someone a "product card with add-to-
 * cart", a "cart with steppers", or a whole section, and have it land intact.
 *
 * Insertion is NOT bespoke: `insertSnapshotSubtrees` is the same engine saved
 * layouts and clipboard paste use, so a block gets the identical treatment —
 * fresh node ids that cannot collide with the page, scoped classes cloned with
 * their `scope.nodeId` remapped, framework classes matched by NAME against
 * this site, and unknown classes imported verbatim.
 *
 * That reuse is the whole reason this slice is short. It is also why blocks
 * carry commerce behaviour for free: bindings, cart verbs, live-region markers
 * and render conditions all live ON the node, so whatever moves the node moves
 * them too.
 */

import type { DukafyBlockExportFile } from '@core/page-tree'
import { treeHasOutlet } from '@core/templates'
import { pushToast } from '@ui/components/Toast'
import { resolveInsertLocation, type InsertLocation } from '@site/store/insertLocation'
import { insertSnapshotSubtrees } from '@site/store/subtreeSnapshot'
import type { EditorStoreSliceCreator } from '@site/store/types'
import { buildSiteHelpers, resolveActiveTreeTarget } from './site/helpers'

interface BlocksSlice {
  /**
   * Graft a parsed block into the active document at the current selection.
   * Returns the new root node id (the first, for a multi-root block), or null
   * when there is no active tree or nothing survived the insert.
   */
  insertBlock: (block: DukafyBlockExportFile, explicitTarget?: InsertLocation) => string | null
}

declare module '@site/store/types' {
  interface EditorStore extends BlocksSlice {}
}

export const createBlocksSlice: EditorStoreSliceCreator<BlocksSlice> = (set, get) => {
  const { mutateActiveTreeAndSite } = buildSiteHelpers(set, get)

  return {
    insertBlock: (block, explicitTarget) => {
      const state = get()
      if (!state.site) return null

      const target = resolveActiveTreeTarget(state)
      if (!target) return null
      const activeTree = target.tree

      const location =
        explicitTarget ??
        resolveInsertLocation(activeTree, state.selectedNodeId ?? activeTree.rootNodeId)
      if (!location) return null

      // One-outlet-per-document invariant — the same guard `insertLayout` and
      // paste apply. A block authored from a template page can carry an
      // outlet, and a second one renders as a dead placeholder.
      const blockHasOutlet = Object.values(block.block.nodes)
        .some((node) => node.moduleId === 'base.outlet')
      if (blockHasOutlet && treeHasOutlet(activeTree)) {
        pushToast({
          kind: 'warning',
          title: 'Only one content outlet',
          body: `"${block.block.name}" includes a content outlet and this document already has one.`,
          location: 'site-editor',
        })
        return null
      }

      const newRootIds: string[] = []
      mutateActiveTreeAndSite((tree, draftSite) => {
        newRootIds.push(...insertSnapshotSubtrees(
          tree,
          draftSite,
          {
            rootNodeIds: block.block.rootNodeIds,
            nodes: block.block.nodes,
            classes: block.block.classes,
          },
          location,
        ))
        return newRootIds.length > 0
      })

      const newRootId = newRootIds[0] ?? null
      if (newRootId) get().selectNode(newRootId)
      return newRootId
    },
  }
}
