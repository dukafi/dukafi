/**
 * Applying `AiEdit[]` to a document — the write path, as a pure function.
 *
 * Lifted out of the editor store so it has exactly one implementation no
 * matter who is driving: the AI panel in the browser, and a headless caller
 * such as the MCP write path, which has no store, no React and no open tab.
 *
 * Purity is the point. This takes a tree and a site, mutates them in place,
 * and returns how many edits landed. It knows nothing about undo, history or
 * zustand — the store's `applyAiEdits` wraps this in one
 * `mutateActiveTreeAndSite` recipe, which is what makes a whole batch a single
 * Cmd+Z. A caller that wants different transaction semantics supplies its own.
 *
 * **The model's output is never trusted.** HTML goes through `importHtml` —
 * the identical pipeline behind the paste-HTML UI, including `stripUnsafe` —
 * so there is no path by which a reply reaches the document that a merchant
 * pasting markup does not also take.
 */

import { importHtml } from '@core/htmlImport'
import { collectSubtreeIds, reindexNodeParents } from '@core/page-tree'
import type { PageNode, StyleRule } from '@core/page-tree'
import { registry } from '@core/module-engine'
import {
  createStyleRuleOrderAllocator,
  indexStyleRulesByName,
  linkImportedClassNames,
} from '@core/siteImport'
import type { AiEdit } from './editSchema'

/** The parts of a page tree these edits touch. */
export interface EditableTree {
  nodes: Record<string, PageNode>
  rootNodeId: string
}

/** The parts of a site these edits touch. */
export interface EditableSite {
  styleRules: Record<string, StyleRule>
}

/**
 * Applies every edit in order, mutating `tree` and `site` in place.
 * Returns the number that actually landed — an edit naming a node that does
 * not exist is skipped, not fatal, because one bad reference should not
 * discard the four good edits either side of it.
 */
export function applyEditsToTree(
  tree: EditableTree,
  site: EditableSite,
  edits: readonly AiEdit[],
): number {
  if (edits.length === 0) return 0

  // Built once for the whole batch so two inserts naming the same Tailwind
  // class share one style rule instead of racing to create it.
  const classesByName = indexStyleRulesByName(site.styleRules)
  const allocateOrder = createStyleRuleOrderAllocator(site.styleRules)
  let applied = 0

  /** Merge an imported fragment's nodes in, linking its class names. */
  const absorb = (html: string): string[] => {
    const fragment = importHtml(html)
    if (fragment.rootIds.length === 0) return []
    for (const [id, node] of Object.entries(fragment.nodes)) {
      tree.nodes[id] = {
        ...node,
        classIds: linkImportedClassNames(
          node.classIds, site.styleRules, classesByName, allocateOrder,
        ),
      }
    }
    return fragment.rootIds
  }

  /** Turn a `class="…"` string into linked style-rule ids. */
  const linkClasses = (classes: string): string[] =>
    linkImportedClassNames(
      classes.split(/\s+/).filter(Boolean), site.styleRules, classesByName, allocateOrder,
    )

  /** Drop a node and everything under it, and unlink it from its parent. */
  const remove = (nodeId: string): boolean => {
    const node = tree.nodes[nodeId]
    // The root is the document; removing it would leave nothing to edit.
    if (!node || nodeId === tree.rootNodeId) return false
    const parent = Object.values(tree.nodes).find((c) => c.children.includes(nodeId))
    if (parent) parent.children = parent.children.filter((id) => id !== nodeId)
    for (const id of collectSubtreeIds(tree.nodes, nodeId)) delete tree.nodes[id]
    return true
  }

  for (const edit of edits) {
    switch (edit.op) {
      case 'insert': {
        const parentId = edit.parentId ?? tree.rootNodeId
        const parent = tree.nodes[parentId]
        if (!parent) break
        // Same rule the manual insert path applies: only the document root and
        // container-like modules accept children.
        const accepts =
          parentId === tree.rootNodeId ||
          registry.get(parent.moduleId)?.canHaveChildren === true
        if (!accepts) break

        const roots = absorb(edit.html)
        if (roots.length === 0) break
        const at = edit.index ?? parent.children.length
        parent.children.splice(Math.max(0, Math.min(at, parent.children.length)), 0, ...roots)
        applied += 1
        break
      }
      case 'replace': {
        const target = tree.nodes[edit.nodeId]
        if (!target || edit.nodeId === tree.rootNodeId) break
        const parent = Object.values(tree.nodes).find((c) => c.children.includes(edit.nodeId))
        if (!parent) break

        const roots = absorb(edit.html)
        if (roots.length === 0) break
        const at = parent.children.indexOf(edit.nodeId)
        parent.children.splice(at, 1, ...roots)
        for (const id of collectSubtreeIds(tree.nodes, edit.nodeId)) delete tree.nodes[id]
        applied += 1
        break
      }
      case 'delete':
        if (remove(edit.nodeId)) applied += 1
        break
      case 'setClasses': {
        const target = tree.nodes[edit.nodeId]
        if (!target) break
        target.classIds = linkClasses(edit.classes)
        applied += 1
        break
      }
      case 'setProps': {
        const target = tree.nodes[edit.nodeId]
        if (!target) break

        // A model asked to restyle reaches for `setProps` with a `class` key no
        // matter what the prompt says — it is what HTML looks like. Written
        // straight through it lands in `props.class`, which nothing renders: a
        // silent no-op counted as a change. Routed here instead, so the obvious
        // phrasing works.
        const { class: classProp, className, ...rest } = edit.props
        const classes = typeof classProp === 'string' ? classProp
          : typeof className === 'string' ? className : null
        if (classes !== null) target.classIds = linkClasses(classes)
        if (Object.keys(rest).length > 0) target.props = { ...target.props, ...rest }
        applied += 1
        break
      }
    }
  }

  if (applied === 0) return 0
  // Nodes were bulk-merged rather than inserted one at a time, so derive the
  // parent index across the tree — the same choice `insertImportedNodes` makes
  // for the same reason.
  reindexNodeParents(tree.nodes)
  return applied
}
