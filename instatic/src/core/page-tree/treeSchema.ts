/**
 * NodeTree — the single tree-of-nodes primitive used everywhere in this
 * codebase: pages, Visual Components, and (via materialization as locked
 * `base.slot-instance` children) slot fills inside VC refs.
 *
 * Architecture source: docs/superpowers/plans/2026-05-06-tree-unification.md
 *
 * Shape:
 *
 *   {
 *     nodes:      Record<nodeId, BaseNode>,    // flat map for O(1) lookup
 *     rootNodeId: string,                       // entry point for traversal
 *   }
 *
 * Pages, VCs, and slot fragments all conform to this shape. A `Page` IS a
 * `NodeTree` — it adds metadata fields (id, slug, title, template?) on top.
 * A `VisualComponent` HAS a `NodeTree` exposed as `vc.tree`. A slot fill is
 * stored as the children subtree of a `base.slot-instance` node, which lives
 * directly in the consumer page's tree (no separate prop, no separate tree).
 *
 * Type-level genericity: `NodeTree<TNode>` accepts a richer node type so the
 * mutation API can preserve typing for callers that work with PageNode (which
 * extends BaseNode with `dynamicBindings`). At runtime, `NodeTreeSchema`
 * validates the BaseNode-shaped subset — richer node types pass because
 * BaseNodeSchema is structurally compatible with their narrowed shape.
 *
 * Constraint #269: this module must not import from editor/ or editor-store/.
 */

import { Type } from '@core/utils/typeboxHelpers'
import { BaseNodeSchema, type BaseNode } from './baseNode'

/**
 * TypeBox schema for the NodeTree shape, validated against the BaseNode-typed
 * node entries. Use at the persistence boundary; the mutation API uses the
 * generic `NodeTree<TNode>` TypeScript type instead, parameterized over the
 * caller's node subtype.
 */
export const NodeTreeSchema = Type.Object({
  /** Flat map of all nodes in the tree, keyed by node id. */
  nodes: Type.Record(Type.String(), BaseNodeSchema),
  /**
   * ID of the root node — entry point for traversal. Pages always use the
   * `base.body` module here; VC trees may use any module the VC author put at
   * the root.
   */
  rootNodeId: Type.String(),
})


/**
 * Generic NodeTree type. `TNode` defaults to BaseNode (the persistence-level
 * shape) but callers that work with PageNode (page tree) or VCNode (VC tree)
 * can constrain it to those richer subtypes for type-safe mutations.
 */
export interface NodeTree<TNode extends BaseNode = BaseNode> {
  nodes: Record<string, TNode>
  rootNodeId: string
}
