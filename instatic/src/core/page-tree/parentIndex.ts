/**
 * parentIndex — recompute the denormalised `parentId` pointer on every node of
 * a flat node map from the structural source of truth (the `children` arrays).
 *
 * `BaseNode.parentId` is an O(1) cache for `getParent`. The `children` arrays
 * remain authoritative; `parentId` is derived from them. Tree mutations keep
 * `parentId` in sync incrementally, but every point where a tree ENTERS the
 * system — parsing persisted data, hydrating the editor store, composing a
 * template chain — must (re)derive it so loaded data and hand-assembled trees
 * are always consistent, regardless of any stored `parentId` value.
 *
 * Tree-agnostic: operates on a raw `Record<string, BaseNode>` so it heals page
 * trees AND Visual Component trees (and any other NodeTree node map) with one
 * implementation. The root node — the one no node lists as a child — and any
 * orphan node end up with `parentId: null`.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import type { BaseNode } from './baseNode'

/**
 * Recompute `parentId` for every node in `nodes` from the `children` arrays.
 * Mutates the nodes in place. O(N + total children) — i.e. linear in tree size.
 *
 * Stored `parentId` values are never trusted: every node is reset to `null`
 * first, then re-stamped from whoever lists it as a child. The result is the
 * single authoritative parent index for the whole map.
 */
export function reindexNodeParents(nodes: Record<string, BaseNode>): void {
  for (const id in nodes) {
    nodes[id].parentId = null
  }
  for (const id in nodes) {
    for (const childId of nodes[id].children) {
      const child = nodes[childId]
      if (child) child.parentId = id
    }
  }
}
