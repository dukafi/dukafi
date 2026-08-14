/**
 * linkRewrite.test.ts — internal links → dynamic page references on import.
 */

import { describe, it, expect } from 'bun:test'
import { createNode } from '@core/page-tree'
import { rewriteInternalLinks } from '@core/siteImport'
import type { PagePlan } from '@core/siteImport'
import type { ImportFragment } from '@core/htmlImport'

function page(source: string, href: string): PagePlan {
  const node = createNode('base.link', { href, text: 'go' })
  const fragment: ImportFragment = { nodes: { [node.id]: node }, rootIds: [node.id] }
  return {
    source,
    title: source,
    slug: source.replace('.html', ''),
    linkedCssPaths: [],
    scripts: [],
    nodeFragment: fragment,
  }
}

function hrefOf(plan: PagePlan): unknown {
  return Object.values(plan.nodeFragment.nodes)[0].props.href
}

const IDS = new Map<string, string>([
  ['index.html', 'home-id'],
  ['club.html', 'club-id'],
])

describe('rewriteInternalLinks', () => {
  it('rewrites a link to another imported page into a page ref', () => {
    const out = rewriteInternalLinks([page('index.html', 'club.html')], IDS)
    expect(hrefOf(out[0])).toBe('cms:page:club-id')
  })

  it('resolves relative "./" prefixes', () => {
    const out = rewriteInternalLinks([page('index.html', './club.html')], IDS)
    expect(hrefOf(out[0])).toBe('cms:page:club-id')
  })

  it('preserves a fragment on the link', () => {
    const out = rewriteInternalLinks([page('index.html', 'club.html#join')], IDS)
    expect(hrefOf(out[0])).toBe('cms:page:club-id#join')
  })

  it('drops a query string (CMS routes are slugs)', () => {
    const out = rewriteInternalLinks([page('index.html', 'club.html?ref=nav')], IDS)
    expect(hrefOf(out[0])).toBe('cms:page:club-id')
  })

  it('leaves external URLs untouched', () => {
    const out = rewriteInternalLinks([page('index.html', 'https://example.com')], IDS)
    expect(hrefOf(out[0])).toBe('https://example.com')
  })

  it('leaves same-page anchors untouched', () => {
    const out = rewriteInternalLinks([page('index.html', '#features')], IDS)
    expect(hrefOf(out[0])).toBe('#features')
  })

  it('leaves links to non-imported files untouched', () => {
    const out = rewriteInternalLinks([page('index.html', 'docs.pdf')], IDS)
    expect(hrefOf(out[0])).toBe('docs.pdf')
  })

  it('is a no-op when there are no imported pages', () => {
    const input = [page('index.html', 'club.html')]
    const out = rewriteInternalLinks(input, new Map())
    expect(out).toBe(input)
  })
})
