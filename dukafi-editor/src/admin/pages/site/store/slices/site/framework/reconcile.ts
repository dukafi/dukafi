/**
 * Framework class reconciliation.
 *
 * Three families (color, typography, spacing) each generate a deterministic
 * set of locked utility classes (`text-primary`, `bg-primary-l-2`, `text-xs`,
 * `padding-md`, etc.) keyed by stable framework IDs of the form
 * `framework:<family>:<...>`.
 *
 * Reconciliation rules:
 *   1. CLAIM — any non-framework class whose name collides with a framework
 *      class is replaced by the framework version. Existing
 *      assignments are remapped to the framework ID and the colliding class
 *      is deleted. This keeps the lock invariant: a framework name is always
 *      backed by the framework class, never by a leftover class with the
 *      same name (which would silently lose the locked state and badge).
 *   2. PRUNE — every class whose ID lives in the framework namespace but is
 *      not in the desired set is deleted and stripped
 *      from every assignment list. Detection is by ID prefix, not by
 *      `generated` metadata, so orphans whose metadata was somehow lost
 *      in a prior round-trip are still cleaned up — no leftover "ghost"
 *      classes that look editable because their lock marker disappeared.
 *   3. UPSERT — desired framework classes are written, preserving the
 *      previously-recorded createdAt timestamp when the same ID already
 *      existed (so timestamps don't churn on every reconcile).
 */

import type { StyleRule, SiteDocument } from '@core/page-tree'
import { generateFrameworkUtilityClasses } from '@core/framework'

const FRAMEWORK_ID_PREFIX = 'framework:'

/**
 * Visit every node-like value in the site that holds a `classIds: string[]`
 * list and let `mutator` produce a new list. Covers Page nodes, the
 * VisualComponent itself, and every VCNode in the VC's flat tree.nodes map.
 */
function mutateAllClassIdLists(
  site: SiteDocument,
  mutator: (classIds: string[]) => string[],
): void {
  const apply = (target: { classIds?: string[] }) => {
    if (!target.classIds) return
    target.classIds = mutator(target.classIds)
  }

  for (const page of site.pages) {
    for (const node of Object.values(page.nodes)) apply(node)
  }

  for (const vc of site.visualComponents) {
    apply(vc as { classIds?: string[] })
    for (const node of Object.values(vc.tree.nodes)) apply(node)
  }
}

function pruneClassIdFromSite(site: SiteDocument, classId: string): void {
  mutateAllClassIdLists(site, (ids) =>
    ids.includes(classId) ? ids.filter((id) => id !== classId) : ids,
  )
}

function remapClassIdInSite(
  site: SiteDocument,
  fromId: string,
  toId: string,
): void {
  mutateAllClassIdLists(site, (ids) => {
    if (!ids.includes(fromId)) return ids
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of ids) {
      const next = id === fromId ? toId : id
      if (seen.has(next)) continue
      seen.add(next)
      out.push(next)
    }
    return out
  })
}

/**
 * Public entry point: regenerate every framework class from `site.settings.framework`
 * and reconcile against `site.styleRules` + every classIds list in the site.
 */
export function reconcileFrameworkClasses(site: SiteDocument): void {
  reconcileFrameworkClassRegistry(site, generateFrameworkUtilityClasses(site.settings.framework))
}

function reconcileFrameworkClassRegistry(
  site: SiteDocument,
  nextClasses: Record<string, StyleRule>,
): void {
  const nextClassIds = new Set(Object.keys(nextClasses))
  const frameworkIdByName = new Map<string, string>()
  for (const [classId, cls] of Object.entries(nextClasses)) {
    frameworkIdByName.set(cls.name, classId)
  }

  // 1. CLAIM — replace non-framework classes whose name collides with a
  //    framework class. Node-scoped classes (module-style
  //    instance layers) are off-limits; their names live in a different
  //    namespace.
  for (const [classId, cls] of Object.entries(site.styleRules)) {
    if (cls.scope) continue
    if (classId.startsWith(FRAMEWORK_ID_PREFIX)) continue
    const frameworkId = frameworkIdByName.get(cls.name)
    if (!frameworkId) continue
    remapClassIdInSite(site, classId, frameworkId)
    delete site.styleRules[classId]
  }

  // 2. PRUNE — delete every class whose ID lives in the framework namespace
  //    but isn't in the desired set. Recognising by ID prefix
  //    means orphans whose `generated` metadata was lost (e.g. through a
  //    prior persistence round-trip) are still cleaned up rather than
  //    silently downgraded into editable user classes.
  for (const classId of Object.keys(site.styleRules)) {
    if (!classId.startsWith(FRAMEWORK_ID_PREFIX)) continue
    if (nextClassIds.has(classId)) continue
    delete site.styleRules[classId]
    pruneClassIdFromSite(site, classId)
  }

  // 3. UPSERT — write the desired classes, preserving prior createdAt.
  for (const [classId, nextClass] of Object.entries(nextClasses)) {
    const existing = site.styleRules[classId]
    site.styleRules[classId] = {
      ...nextClass,
      createdAt: existing?.createdAt ?? nextClass.createdAt,
    }
  }
}
