import { describe, expect, it } from 'bun:test'
import {
  buildPageExport,
  buildSiteExport,
  importPageIntoSite,
  parsePageExport,
  parseSiteExport,
  type StyleRule,
} from '@core/page-tree'
import { makeNode, makePage, makeSite } from '../fixtures'

function makeClass(overrides: Partial<StyleRule> & { id: string; name: string }): StyleRule {
  return {
    kind: 'class',
    selector: `.${overrides.name}`,
    order: 0,
    styles: {},
    contextStyles: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('page export/import round-trip', () => {
  it('buildPageExport captures only the classes the page actually references', () => {
    const page = makePage({
      id: 'page-1',
      slug: 'about',
      title: 'About',
      rootNodeId: 'root',
      nodes: {
        root: makeNode({ id: 'root', moduleId: 'base.body', children: ['title'], classIds: ['bg'] }),
        title: makeNode({ id: 'title', moduleId: 'base.text', classIds: ['heading'] }),
      },
    })
    const siteClasses: Record<string, StyleRule> = {
      bg: makeClass({ id: 'bg', name: 'bg-slate-700' }),
      heading: makeClass({ id: 'heading', name: 'text-4xl' }),
      unrelated: makeClass({ id: 'unrelated', name: 'never-used' }),
    }

    const exported = buildPageExport(page, siteClasses)

    expect(exported.dukafyExport).toBe('page')
    expect(exported.page.title).toBe('About')
    expect(exported.page.slug).toBe('about')
    expect(Object.keys(exported.page.nodes).sort()).toEqual(['root', 'title'])
    expect(Object.keys(exported.page.classes).sort()).toEqual(['bg', 'heading'])
  })

  it('parsePageExport round-trips a built export and rejects garbage', () => {
    const page = makePage({ nodes: { root: makeNode({ id: 'root', moduleId: 'base.body' }) } })
    const exported = buildPageExport(page, {})
    const json = JSON.parse(JSON.stringify(exported))

    const parsed = parsePageExport(json)
    expect(parsed).not.toBeNull()
    expect(parsed?.page.title).toBe(page.title)
    expect(parsed?.page.rootNodeId).toBe(page.rootNodeId)

    expect(parsePageExport(null)).toBeNull()
    expect(parsePageExport({})).toBeNull()
    expect(parsePageExport({ dukafyExport: 'site' })).toBeNull()
    expect(parsePageExport({ dukafyExport: 'page', page: { title: 'x' } })).toBeNull()
  })

  it('importPageIntoSite grafts a new page with fresh, collision-free node ids and a unique slug', () => {
    const existing = makePage({
      id: 'existing-page',
      slug: 'about',
      rootNodeId: 'shared-id',
      nodes: { 'shared-id': makeNode({ id: 'shared-id', moduleId: 'base.body' }) },
    })
    const site = makeSite({ pages: [existing] })

    const exported = buildPageExport(
      makePage({
        slug: 'about', // deliberately collides with the existing page's slug
        title: 'Imported About',
        rootNodeId: 'shared-id', // deliberately collides with an existing node id
        nodes: {
          'shared-id': makeNode({ id: 'shared-id', moduleId: 'base.body', children: ['child'] }),
          child: makeNode({ id: 'child', moduleId: 'base.text' }),
        },
      }),
      {},
    )

    const newPage = importPageIntoSite(site, exported)

    expect(newPage.slug).not.toBe('about') // uniquePageSlug must disambiguate
    expect(newPage.id).not.toBe(existing.id)
    expect(Object.keys(newPage.nodes)).toHaveLength(2)
    // Fresh ids — none of the imported page's node ids collide with the site's existing node ids.
    for (const id of Object.keys(newPage.nodes)) {
      expect(id === 'shared-id').toBe(false)
    }
    expect(site.pages).toHaveLength(2)
    // The pre-existing page and its node id are untouched.
    expect(site.pages[0]!.nodes['shared-id']).toBeDefined()
  })

  it('importPageIntoSite clones scoped classes with a remapped scope.nodeId, reuses regular classes already present, and drops unmatched framework classes', () => {
    const site = makeSite({
      pages: [makePage()],
      styleRules: {
        shared: makeClass({ id: 'shared', name: 'shared-class' }),
      },
    })

    const exported = buildPageExport(
      makePage({
        rootNodeId: 'root',
        nodes: {
          root: makeNode({ id: 'root', moduleId: 'base.body', children: ['child'], classIds: ['shared', 'scoped', 'fw'] }),
          child: makeNode({ id: 'child', moduleId: 'base.text' }),
        },
      }),
      {},
    )
    // Hand-craft the classes map (buildPageExport already narrowed to referenced
    // classes, but the fixture didn't pass a siteClasses map above) so the test
    // exercises all three reconciliation paths in one page.
    exported.page.classes = {
      shared: makeClass({ id: 'shared', name: 'shared-class' }),
      scoped: makeClass({ id: 'scoped', name: 'scoped-class', scope: { type: 'node', nodeId: 'root', role: 'module-style' } }),
      'framework:unknown': makeClass({ id: 'framework:unknown', name: 'framework-thing' }),
    }

    const newPage = importPageIntoSite(site, exported)
    const newRoot = newPage.nodes[newPage.rootNodeId]!

    // Regular class already present in the target site — reused verbatim (same id).
    expect(newRoot.classIds).toContain('shared')
    // Scoped class — cloned with a fresh id, not reusing "scoped".
    expect(newRoot.classIds).not.toContain('scoped')
    const clonedScopedId = newRoot.classIds.find((id) => id !== 'shared')
    expect(clonedScopedId).toBeDefined()
    expect(site.styleRules[clonedScopedId!]?.scope).toEqual({ type: 'node', nodeId: newPage.rootNodeId, role: 'module-style' })
    // Unmatched framework class — dropped entirely (no name match in target site).
    expect(newRoot.classIds).not.toContain('framework:unknown')
  })
})

describe('site export/import round-trip', () => {
  it('buildSiteExport + parseSiteExport round-trips pages and drops non-functional VC/layout data', () => {
    const site = makeSite({
      pages: [makePage({ id: 'p1', slug: 'index', title: 'Home' })],
    })
    const exported = buildSiteExport(site)
    const json = JSON.parse(JSON.stringify(exported))

    const parsed = parseSiteExport(json)
    expect(parsed).not.toBeNull()
    expect(parsed?.site.pages).toHaveLength(1)
    expect(parsed?.site.pages[0]!.slug).toBe('index')
    expect(parsed?.site.visualComponents).toEqual([])
    expect(parsed?.site.layouts).toEqual([])
  })

  it('parseSiteExport rejects a file with zero valid pages and tolerates a mix of good/bad pages', () => {
    expect(parseSiteExport({ dukafyExport: 'site', site: { ...makeSite(), pages: [] } })).toBeNull()

    const site = makeSite({ pages: [makePage({ id: 'ok', slug: 'index' })] })
    const exported = buildSiteExport(site)
    const withBadPage = {
      ...exported,
      site: { ...exported.site, pages: [...exported.site.pages, { not: 'a page' }] },
    }
    const parsed = parseSiteExport(withBadPage)
    expect(parsed?.site.pages).toHaveLength(1)
  })

  it('parseSiteExport rejects the wrong envelope tag', () => {
    expect(parseSiteExport({ dukafyExport: 'page', site: makeSite() })).toBeNull()
    expect(parseSiteExport(null)).toBeNull()
  })
})
