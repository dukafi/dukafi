/**
 * Commerce scaffold slice — "Insert product" / "Insert collection" / "Insert
 * variant list" from the module picker.
 *
 * Restore goes through the SAME snapshot engine as saved layouts and the
 * clipboard (`@site/store/subtreeSnapshot`), just with a code-defined
 * snapshot instead of a `SavedLayout` row — these scaffolds never contain a
 * `base.outlet` or a `base.visual-component-ref`, so none of `insertLayout`'s
 * outlet/VC-cycle guards apply here.
 */
import {
  buildCartScaffoldSnapshot,
  buildProductScaffoldSnapshot,
  buildRelationshipLoopSnapshot,
  type RelationshipKind,
} from '@site/store/commerceScaffold'
import { resolveInsertLocation, type InsertLocation } from '@site/store/insertLocation'
import { insertSnapshotSubtrees } from '@site/store/subtreeSnapshot'
import type { EditorStoreSliceCreator } from '@site/store/types'
import { buildSiteHelpers, resolveActiveTreeTarget } from './site/helpers'

interface CommerceScaffoldSlice {
  /**
   * Insert a plain product scaffold (bound image/title/price, linked to the
   * product page) at the resolved location. Returns the new root node id, or
   * null when there's no active tree to insert into.
   */
  insertProductScaffold: (explicitTarget?: InsertLocation) => string | null

  /**
   * Insert a `store.relationship-loop` pre-configured for `relationship`,
   * containing the matching row scaffold as its child. "Insert collection"
   * is `insertRelationshipLoop('products')`.
   */
  insertRelationshipLoop: (relationship: RelationshipKind, explicitTarget?: InsertLocation) => string | null

  /**
   * Insert a whole cart: a `cartItems` loop with a line row, plus a subtotal
   * bound to the `cart` frame. A starting point the merchant then edits —
   * Dukafy ships no cart component.
   */
  insertCartScaffold: (explicitTarget?: InsertLocation) => string | null
}

declare module '@site/store/types' {
  interface EditorStore extends CommerceScaffoldSlice {}
}

export const createCommerceScaffoldSlice: EditorStoreSliceCreator<CommerceScaffoldSlice> = (
  set,
  get,
) => {
  const { mutateActiveTreeAndSite } = buildSiteHelpers(set, get)

  function insertSnapshot(
    snapshot: { rootNodeIds: string[]; nodes: Record<string, import('@core/page-tree').PageNode> },
    explicitTarget?: InsertLocation,
  ): string | null {
    const state = get()
    const target = resolveActiveTreeTarget(state)
    if (!target) return null
    const activeTree = target.tree

    const location =
      explicitTarget ??
      resolveInsertLocation(activeTree, state.selectedNodeId ?? activeTree.rootNodeId)
    if (!location) return null

    const newRootIds: string[] = []
    mutateActiveTreeAndSite((tree, draftSite) => {
      newRootIds.push(...insertSnapshotSubtrees(tree, draftSite, { ...snapshot, classes: {} }, location))
      return newRootIds.length > 0
    })

    const newRootId = newRootIds[0] ?? null
    if (newRootId) get().selectNode(newRootId)
    return newRootId
  }

  return {
    insertProductScaffold: (explicitTarget) => insertSnapshot(buildProductScaffoldSnapshot(), explicitTarget),
    insertRelationshipLoop: (relationship, explicitTarget) =>
      insertSnapshot(buildRelationshipLoopSnapshot(relationship), explicitTarget),
    insertCartScaffold: (explicitTarget) => insertSnapshot(buildCartScaffoldSnapshot(), explicitTarget),
  }
}
