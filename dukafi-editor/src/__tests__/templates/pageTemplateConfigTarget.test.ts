/**
 * Verifies that `target` is the canonical field in `PageTemplateConfig` after
 * the unified-template change, and that it survives site validation:
 *
 * - A `postTypes` target round-trips through site serialization unchanged.
 * - `resolveTemplateChain` matches an entry route by the target's table slug.
 * - `parsePageTemplate` (via validateSite) rejects a malformed target.
 */

import { describe, expect, it } from 'bun:test'
import { makeSite, makePage, makeNode } from '../fixtures'
import { validateSite, validatePages } from '@core/persistence/validate'
import { resolveTemplateChain } from '@core/templates'

describe('pageTemplateConfig target', () => {
  it('round-trips a postTypes template through site serialization', () => {
    const site = makeSite()
    const page = site.pages[0]
    page.template = { enabled: true, target: { kind: 'postTypes', tableSlugs: ['posts'] }, priority: 0 }

    const shell = validateSite(site)
    const pages = validatePages(shell, site.pages)

    expect(pages[0].template).toEqual({
      enabled: true,
      target: { kind: 'postTypes', tableSlugs: ['posts'] },
      priority: 0,
    })
  })

  it('resolveTemplateChain matches an entry route by the target table slug', () => {
    const root = makeNode({ id: 'root', moduleId: 'base.body' })
    const templatePage = makePage({
      id: 'template-page',
      title: 'Post Template',
      slug: 'post-template',
      rootNodeId: 'root',
      nodes: { root },
      template: {
        enabled: true,
        // tableSlugs store DATA TABLE SLUGS — not table ids.
        target: { kind: 'postTypes', tableSlugs: ['my-posts'] },
        priority: 0,
      },
    })
    const site = makeSite({ pages: [templatePage] })

    expect(resolveTemplateChain(site, { kind: 'entry', tableSlug: 'my-posts' }).at(-1)?.id).toBe('template-page')
    expect(resolveTemplateChain(site, { kind: 'entry', tableSlug: '42' })).toEqual([])
  })

  it('parsePageTemplate rejects a payload with a malformed target', () => {
    const site = makeSite()
    const page = site.pages[0]
    ;(page as unknown as Record<string, unknown>).template = {
      enabled: true,
      target: { kind: 'nonsense' },
      priority: 0,
    }

    const shell = validateSite(site)
    const pages = validatePages(shell, site.pages)

    // parsePageTemplate returns null for a malformed target → template dropped.
    expect(pages[0].template).toBeUndefined()
  })
})
