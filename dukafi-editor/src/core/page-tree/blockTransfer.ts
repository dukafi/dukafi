/**
 * Block transfer — import/export a SUBTREE, the way pages already move.
 *
 * A page export is a whole document with a slug and a root. A block is the
 * same idea scoped to any node: a section, a card, a cart — everything from
 * that node down, as one structured JSON file.
 *
 * What makes this worth a format rather than a copy/paste is the OVERLAYS. A
 * block carries the parts of a node that make it commerce, not just markup:
 *
 *   · `dynamicBindings` — `{currentEntry.title}`, `{cart.subtotalDisplay}`
 *   · `actions.click`   — cart verbs (add, set quantity, remove, place order)
 *   · `actions.region`  — the cart / payment live-region marker
 *   · `visibleWhen`     — render conditions ("only when this item IS in cart")
 *   · loop props        — `source: "cart.items"`, `collections/x.products`
 *
 * None of that needs special handling here: every node round-trips through
 * `parsePageNode`, which owns all of it. That is the point of keeping those
 * overlays on the node rather than in a side table — a block is portable for
 * free, and stays portable as new overlays are added.
 *
 * Insertion (fresh ids, class reconciliation, VC healing) is NOT this file's
 * job — `insertSnapshotSubtrees` in the editor store already does it for
 * saved layouts and clipboard pastes, and a block is the same shape.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import type { PageNode } from './pageNode'
import { parsePageNode } from './pageNode'
import type { StyleRule } from './styleRule'
import { parseStyleRule } from './styleRule'
import { collectReferencedClasses } from './pageTransfer'
import { collectSubtreeIds } from './selectors'

const FORMAT_VERSION = 1

export interface DukafiBlockExportFile {
  dukafyExport: 'block'
  version: number
  exportedAt: number
  block: {
    /** Human label, shown in the inserter. Not an id — blocks aren't stored. */
    name: string
    /** Ordered roots. Usually one; several when a multi-selection was exported. */
    rootNodeIds: string[]
    /** Every node in every exported subtree, flat and id-keyed. */
    nodes: Record<string, PageNode>
    /** Style rules any exported node references, so the block carries its look. */
    classes: Record<string, StyleRule>
  }
}

/**
 * Capture the subtrees rooted at `rootNodeIds` out of `nodes`.
 *
 * Ids not present are skipped rather than throwing — exporting a stale
 * selection should produce a smaller block, not an error.
 */
export function buildBlockExport(
  name: string,
  rootNodeIds: string[],
  nodes: Record<string, PageNode>,
  siteClasses: Record<string, StyleRule>,
): DukafiBlockExportFile {
  const captured: Record<string, PageNode> = {}
  const roots: string[] = []
  for (const rootId of rootNodeIds) {
    if (!nodes[rootId]) continue
    roots.push(rootId)
    for (const id of collectSubtreeIds(nodes, rootId)) {
      const node = nodes[id]
      if (node) captured[id] = node
    }
  }

  return {
    dukafyExport: 'block',
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    block: {
      name: name.trim() || 'Block',
      rootNodeIds: roots,
      nodes: captured,
      classes: collectReferencedClasses(captured, siteClasses),
    },
  }
}

/**
 * Tolerant parse of a block file. Returns null when the shape is not a block
 * at all; individual malformed NODES are dropped rather than failing the whole
 * import, matching `parsePageExport`.
 */
export function parseBlockExport(raw: unknown): DukafiBlockExportFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.dukafyExport !== 'block') return null
  if (!r.block || typeof r.block !== 'object' || Array.isArray(r.block)) return null

  const b = r.block as Record<string, unknown>
  if (!Array.isArray(b.rootNodeIds) || b.rootNodeIds.length === 0) return null
  if (!b.nodes || typeof b.nodes !== 'object' || Array.isArray(b.nodes)) return null

  const nodes: Record<string, PageNode> = {}
  for (const rawNode of Object.values(b.nodes as Record<string, unknown>)) {
    try {
      const node = parsePageNode(rawNode, 'node')
      nodes[node.id] = node
    } catch {
      // Tolerant drop — one bad node must not reject the file.
    }
  }

  // A root that did not survive parsing would insert nothing, so drop it. If
  // none survive there is no block left to import.
  const rootNodeIds = b.rootNodeIds.filter(
    (id): id is string => typeof id === 'string' && Boolean(nodes[id]),
  )
  if (rootNodeIds.length === 0) return null

  const classes: Record<string, StyleRule> = {}
  if (b.classes && typeof b.classes === 'object' && !Array.isArray(b.classes)) {
    for (const rawClass of Object.values(b.classes as Record<string, unknown>)) {
      const cls = parseStyleRule(rawClass)
      if (cls) classes[cls.id] = cls
    }
  }

  return {
    dukafyExport: 'block',
    version: typeof r.version === 'number' ? r.version : FORMAT_VERSION,
    exportedAt: typeof r.exportedAt === 'number' ? r.exportedAt : Date.now(),
    block: {
      name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Block',
      rootNodeIds,
      nodes,
      classes,
    },
  }
}
