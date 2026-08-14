import { describe, expect, it } from 'bun:test'
import { makeSite } from '../fixtures'
import { normalizeRouteBase } from '@core/templates/templateMatching'
import { resolveTemplateChain } from '@core/templates'

const postsTarget = { kind: 'postTypes' as const, tableSlugs: ['posts'] }

describe('template matching', () => {
  it('normalizes collection route bases', () => {
    expect(normalizeRouteBase('posts')).toBe('/posts')
    expect(normalizeRouteBase('/blog/')).toBe('/blog')
    expect(normalizeRouteBase('')).toBe('/')
  })

  it('selects the highest priority matching entry template', () => {
    const site = makeSite()
    const firstPage = site.pages[0]
    firstPage.id = 'low-priority-page'
    firstPage.template = { enabled: true, target: postsTarget, priority: 10 }

    site.pages.push({
      ...structuredClone(firstPage),
      id: 'high-priority-page',
      title: 'Post Template',
      slug: 'post-template',
      template: { enabled: true, target: postsTarget, priority: 100 },
    })

    const chain = resolveTemplateChain(site, { kind: 'entry', tableSlug: 'posts' })
    expect(chain.at(-1)?.id).toBe('high-priority-page')
  })

  it('uses page order as the tie-breaker for equal priority templates', () => {
    const site = makeSite()
    site.pages[0].id = 'first-template'
    site.pages[0].template = { enabled: true, target: postsTarget, priority: 50 }

    site.pages.push({
      ...structuredClone(site.pages[0]),
      id: 'second-template',
      slug: 'second-template',
    })

    const chain = resolveTemplateChain(site, { kind: 'entry', tableSlug: 'posts' })
    expect(chain.at(-1)?.id).toBe('first-template')
  })
})
