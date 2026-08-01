/**
 * Framework class change impact — types + diffing helper.
 *
 * Used by the editor when a destructive framework change (disable token,
 * disable shades/tints, remove utility, delete a typography/spacing group,
 * etc.) is about to remove framework-generated classes that are still
 * assigned to elements. The dialog needs to tell the user exactly what
 * will go away and where it is currently used so they can cancel or
 * commit deliberately.
 *
 * `previewFrameworkClassRemovals` is intentionally pure: it diffs a
 * before-site against an after-site (the after-site is produced by
 * cloning, applying the user's mutation, and running the framework
 * reconcilers — that lives in the editor store slice that owns the
 * reconcilers). This module owns the *shape* of the answer, not the
 * mechanics of producing it.
 */

import type { SiteDocument } from '@core/page-tree'

/**
 * One spot in the site where a soon-to-be-removed framework class is
 * currently assigned. The `kind` discriminator lets the dialog render
 * page-rooted assignments and visual-component-rooted assignments
 * differently (a VC instance can appear on many pages, so saying
 * "Card → Heading" rather than a single page is the only honest label).
 */
export interface FrameworkClassUsageRef {
  classId: string
  className: string
  source:
    | {
        kind: 'page'
        pageId: string
        pageTitle: string
        nodeId: string
        nodeLabel: string
      }
    | {
        kind: 'visualComponent'
        vcId: string
        vcName: string
        nodeId: string
        nodeLabel: string
      }
}

export interface FrameworkChangeImpact {
  removedClasses: Array<{ id: string; name: string }>
  usages: FrameworkClassUsageRef[]
}

/**
 * Diff `beforeSite` against `afterSite`, returning the framework classes
 * that exist in `before` but not in `after` along with every assignment
 * those classes still have in `before`.
 *
 * Returns `null` when the change removes nothing OR removes only classes
 * that are not assigned anywhere — the caller can commit silently in
 * either case (no dialog needed).
 *
 * Notes on assignment scope:
 *   - Page assignments come from `site.pages[].nodes[].classIds`.
 *   - Visual-component assignments come from each VisualComponent's
 *     own top-level `classIds` (rare but possible) and from every node
 *     in its flat `tree.nodes` map.
 *   - Node-scoped instance classes (module-style layers) carry a
 *     `scope.type === 'node'` marker; they are framework-namespace-free
 *     and won't appear here.
 */
export function previewFrameworkClassRemovals(
  beforeSite: SiteDocument,
  afterSite: SiteDocument,
): FrameworkChangeImpact | null {
  const removedIds: string[] = []
  for (const id of Object.keys(beforeSite.styleRules)) {
    if (!(id in afterSite.styleRules)) removedIds.push(id)
  }
  if (removedIds.length === 0) return null

  const removedSet = new Set(removedIds)
  const usages: FrameworkClassUsageRef[] = []

  // Walk pages
  for (const page of beforeSite.pages) {
    for (const node of Object.values(page.nodes)) {
      if (!node.classIds) continue
      for (const classId of node.classIds) {
        if (!removedSet.has(classId)) continue
        usages.push({
          classId,
          className: beforeSite.styleRules[classId]?.name ?? classId,
          source: {
            kind: 'page',
            pageId: page.id,
            pageTitle: page.title,
            nodeId: node.id,
            nodeLabel: node.label ?? node.moduleId,
          },
        })
      }
    }
  }

  // Walk VCs (top-level + every node in the tree)
  for (const vc of beforeSite.visualComponents) {
    if (vc.classIds) {
      for (const classId of vc.classIds) {
        if (!removedSet.has(classId)) continue
        usages.push({
          classId,
          className: beforeSite.styleRules[classId]?.name ?? classId,
          source: {
            kind: 'visualComponent',
            vcId: vc.id,
            vcName: vc.name,
            nodeId: vc.tree.rootNodeId,
            nodeLabel: '(component-level)',
          },
        })
      }
    }
    for (const node of Object.values(vc.tree.nodes)) {
      if (!node.classIds) continue
      for (const classId of node.classIds) {
        if (!removedSet.has(classId)) continue
        usages.push({
          classId,
          className: beforeSite.styleRules[classId]?.name ?? classId,
          source: {
            kind: 'visualComponent',
            vcId: vc.id,
            vcName: vc.name,
            nodeId: node.id,
            nodeLabel: node.label ?? node.moduleId,
          },
        })
      }
    }
  }

  if (usages.length === 0) return null

  const removedClasses = removedIds.map((id) => ({
    id,
    name: beforeSite.styleRules[id]?.name ?? id,
  }))
  return { removedClasses, usages }
}

