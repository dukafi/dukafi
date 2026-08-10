/**
 * Page / site transfer — portable JSON files a user can download from this
 * editor and re-import into this same editor later (or into a different
 * Dukafy install). Deliberately NOT a generic interchange format: no HTML/CSS
 * emission, no external-tool compatibility. That's what the (currently
 * backend-less, Instatic-era) `SiteExport`/`SiteImport` ZIP-bundle system
 * under `admin/modals/` was for — this is a smaller, self-contained
 * alternative that only needs to round-trip through this editor.
 *
 * The page format reuses the exact snapshot shape Saved Layouts and the
 * clipboard already use — a flat node map rooted at `rootNodeId` plus every
 * style rule the captured nodes referenced — just with a file download/
 * upload transport instead of the `data_rows` "layouts" table (a system
 * Dukafy's Ruby backend never implemented).
 *
 * Constraint #269: no imports from editor / editor-store here.
 */
import { nanoid } from 'nanoid'
import type { Page } from './page'
import { parsePage } from './page'
import type { PageNode } from './pageNode'
import { parsePageNode } from './pageNode'
import type { StyleRule } from './styleRule'
import { parseStyleRule } from './styleRule'
import type { SiteDocument, SiteShell } from './siteDocument'
import { parseSiteDocument } from './siteDocument'
import { uniquePageSlug } from './slugs'
import { cloneScopedClassesForNodeMap } from './scopedClassClone'
import { cloneNodeWithRemap } from './cloneNode'
import { reindexNodeParents } from './parentIndex'

const FRAMEWORK_ID_PREFIX = 'framework:'
const FORMAT_VERSION = 1

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export interface DukafyPageExportFile {
  dukafyExport: 'page'
  version: number
  exportedAt: number
  page: {
    title: string
    slug: string
    rootNodeId: string
    nodes: Record<string, PageNode>
    classes: Record<string, StyleRule>
  }
}

/** Every style rule referenced by any node in `nodes`, from `siteClasses`. */
function collectReferencedClasses(
  nodes: Record<string, PageNode>,
  siteClasses: Record<string, StyleRule>,
): Record<string, StyleRule> {
  const classes: Record<string, StyleRule> = {}
  for (const node of Object.values(nodes)) {
    for (const classId of node.classIds) {
      if (classes[classId]) continue
      const cls = siteClasses[classId]
      if (cls) classes[classId] = cls
    }
  }
  return classes
}

export function buildPageExport(page: Page, siteClasses: Record<string, StyleRule>): DukafyPageExportFile {
  return {
    dukafyExport: 'page',
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    page: {
      title: page.title,
      slug: page.slug,
      rootNodeId: page.rootNodeId,
      nodes: page.nodes,
      classes: collectReferencedClasses(page.nodes, siteClasses),
    },
  }
}

/** Tolerant parser — mirrors `parseSavedLayout`'s drop-invalid-entries style. */
export function parsePageExport(raw: unknown): DukafyPageExportFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.dukafyExport !== 'page') return null
  if (!r.page || typeof r.page !== 'object' || Array.isArray(r.page)) return null
  const p = r.page as Record<string, unknown>
  if (typeof p.title !== 'string' || p.title.length === 0) return null
  if (typeof p.slug !== 'string' || p.slug.length === 0) return null
  if (typeof p.rootNodeId !== 'string' || p.rootNodeId.length === 0) return null
  if (!p.nodes || typeof p.nodes !== 'object' || Array.isArray(p.nodes)) return null

  const nodes: Record<string, PageNode> = {}
  for (const rawNode of Object.values(p.nodes as Record<string, unknown>)) {
    try {
      const node = parsePageNode(rawNode, 'node')
      nodes[node.id] = node
    } catch {
      // Tolerant drop — a structurally invalid node is omitted rather than
      // rejecting the whole file.
    }
  }
  if (!nodes[p.rootNodeId]) return null
  reindexNodeParents(nodes)

  const classes: Record<string, StyleRule> = {}
  if (p.classes && typeof p.classes === 'object' && !Array.isArray(p.classes)) {
    for (const rawClass of Object.values(p.classes as Record<string, unknown>)) {
      const cls = parseStyleRule(rawClass)
      if (cls) classes[cls.id] = cls
    }
  }

  return {
    dukafyExport: 'page',
    version: typeof r.version === 'number' ? r.version : FORMAT_VERSION,
    exportedAt: typeof r.exportedAt === 'number' ? r.exportedAt : Date.now(),
    page: { title: p.title, slug: p.slug, rootNodeId: p.rootNodeId, nodes, classes },
  }
}

/**
 * Graft an exported page into `site` as a brand-new page: fresh node ids
 * (collision-proof against the rest of the site), fresh page id, a
 * collision-safe slug. Structured exactly like `duplicatePage`, sourcing the
 * "old" side from a foreign snapshot instead of another page in this site.
 *
 * Class reconciliation (same rules the clipboard/saved-layout paste engine
 * uses — see `subtreeSnapshot.ts`'s `insertSnapshotSubtrees`):
 *  - Scoped (per-node) classes are always cloned with a fresh id and
 *    `scope.nodeId` remapped to the new node's id.
 *  - Framework classes are matched by NAME against the target site's classes
 *    (ids are deterministic-but-regenerable, so a stale id from the export
 *    file may not match) — dropped if no match exists.
 *  - Regular classes are reused if the target site already has that id, else
 *    imported verbatim.
 */
export function importPageIntoSite(site: SiteDocument, exported: DukafyPageExportFile): Page {
  const src = exported.page

  const idMap = new Map<string, string>()
  for (const oldId of Object.keys(src.nodes)) idMap.set(oldId, nanoid())

  const { added: clonedScopedClasses, classIdRemap: scopedRemap } = cloneScopedClassesForNodeMap(
    idMap,
    src.classes,
  )
  for (const cls of clonedScopedClasses) site.styleRules[cls.id] = cls

  const frameworkByName = new Map<string, string>()
  for (const [id, cls] of Object.entries(site.styleRules)) {
    if (id.startsWith(FRAMEWORK_ID_PREFIX)) frameworkByName.set(cls.name, id)
  }

  const nonScopedRemap = new Map<string, string | null>()
  for (const [classId, cls] of Object.entries(src.classes)) {
    if (cls.scope?.type === 'node') continue // handled by cloneScopedClassesForNodeMap above
    if (classId.startsWith(FRAMEWORK_ID_PREFIX)) {
      if (site.styleRules[classId]) {
        nonScopedRemap.set(classId, classId)
      } else {
        nonScopedRemap.set(classId, frameworkByName.get(cls.name) ?? null)
      }
    } else if (site.styleRules[classId]) {
      nonScopedRemap.set(classId, classId)
    } else {
      site.styleRules[classId] = {
        ...cls,
        styles: { ...cls.styles },
        ...(cls.stylePriorities ? { stylePriorities: { ...cls.stylePriorities } } : {}),
        contextStyles: Object.fromEntries(
          Object.entries(cls.contextStyles).map(([ctx, s]) => [ctx, { ...s }]),
        ),
      }
      nonScopedRemap.set(classId, classId)
    }
  }

  const classIdRemap = (classId: string): string | null => {
    if (scopedRemap.has(classId)) return scopedRemap.get(classId) ?? null
    if (nonScopedRemap.has(classId)) return nonScopedRemap.get(classId) ?? null
    return site.styleRules[classId] ? classId : null
  }

  const newNodes: Record<string, PageNode> = {}
  for (const [oldId, oldNode] of Object.entries(src.nodes)) {
    const newId = idMap.get(oldId)!
    newNodes[newId] = cloneNodeWithRemap(oldNode, { newId, idMap, classIdRemap })
  }
  const newRootId = idMap.get(src.rootNodeId)
  if (!newRootId) throw new Error('[PageTransfer] exported root node missing from its own nodes map')
  reindexNodeParents(newNodes)

  const newPage: Page = {
    id: nanoid(),
    title: src.title,
    slug: uniquePageSlug(src.slug, site.pages),
    rootNodeId: newRootId,
    nodes: newNodes,
  }
  site.pages.push(newPage)
  return newPage
}

// ---------------------------------------------------------------------------
// Site export
// ---------------------------------------------------------------------------

export interface DukafySiteExportFile {
  dukafyExport: 'site'
  version: number
  exportedAt: number
  site: SiteDocument
}

export function buildSiteExport(site: SiteDocument): DukafySiteExportFile {
  return { dukafyExport: 'site', version: FORMAT_VERSION, exportedAt: Date.now(), site }
}

/**
 * Tolerant parser. Validates the shell via `parseSiteDocument` (the same
 * parser normal site loads use) and each page via `parsePage`, dropping
 * individually-malformed pages rather than rejecting the whole file. Returns
 * null if the shell is invalid or zero valid pages remain (a site needs at
 * least one page).
 *
 * `visualComponents`/`layouts` are intentionally dropped on import — neither
 * is a persisted feature in Dukafy today (both are Instatic-era `data_rows`
 * concepts this fork never wired to a Ruby backend), so there is nothing
 * real to round-trip.
 */
export function parseSiteExport(raw: unknown): DukafySiteExportFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.dukafyExport !== 'site') return null
  if (!r.site || typeof r.site !== 'object' || Array.isArray(r.site)) return null

  let shell: SiteShell
  try {
    shell = parseSiteDocument(r.site)
  } catch {
    return null
  }

  const rawPages = (r.site as Record<string, unknown>).pages
  if (!Array.isArray(rawPages)) return null
  const pages: Page[] = []
  rawPages.forEach((rawPage, index) => {
    try {
      pages.push(parsePage(rawPage, index))
    } catch {
      // Tolerant drop — one malformed page doesn't sink the whole import.
    }
  })
  if (pages.length === 0) return null

  return {
    dukafyExport: 'site',
    version: typeof r.version === 'number' ? r.version : FORMAT_VERSION,
    exportedAt: typeof r.exportedAt === 'number' ? r.exportedAt : Date.now(),
    site: { ...shell, pages, visualComponents: [], layouts: [] },
  }
}
