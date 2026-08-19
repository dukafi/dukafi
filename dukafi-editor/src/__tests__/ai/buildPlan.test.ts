/**
 * Build plans are JSON the merchant approves. Compilation to HTML is code —
 * the model never authors the markup, and a missing library photo is a missed
 * slot, not a placeholder URL.
 */

import { describe, expect, it } from 'bun:test'
import {
  compileBuildPlan,
  matchLibraryAsset,
  parseBuildPlan,
  resolvePlanMedia,
  type BuildPlan,
  type LibraryAsset,
} from '@core/ai'

const library: LibraryAsset[] = [
  { path: '/uploads/shop-front.jpg', filename: 'shop-front.jpg', altText: 'The storefront' },
  { path: '/uploads/bag.jpg', filename: 'bag.jpg', altText: 'Leather bag' },
]

function planReply(json: string, prose = 'Here is a section.'): string {
  return `${prose}\n\n\`\`\`json\n${json}\n\`\`\``
}

describe('parseBuildPlan', () => {
  it('pulls the plan out of a fenced block and keeps the prose', () => {
    const { plan, text } = parseBuildPlan(planReply(JSON.stringify({
      title: 'About us',
      summary: 'A short story.',
      blocks: [{ heading: 'Started in 2019', body: 'Same-day sewing.' }],
    })))

    expect(text).toBe('Here is a section.')
    expect(plan).toEqual({
      title: 'About us',
      summary: 'A short story.',
      blocks: [{
        heading: 'Started in 2019',
        body: 'Same-day sewing.',
        media: null,
      }],
    })
  })

  it('returns nothing for an empty or edits-shaped payload', () => {
    expect(parseBuildPlan('```json\n{}\n```').plan).toBeNull()
    expect(parseBuildPlan('```json\n{"title":"","blocks":[]}\n```').plan).toBeNull()
    expect(parseBuildPlan('```json\n{"edits":[{"op":"insert","html":"<p>x</p>"}]}\n```').plan).toBeNull()
    expect(parseBuildPlan('Just a sentence.').plan).toBeNull()
  })

  it('drops a path the model invented', () => {
    const { plan } = parseBuildPlan(JSON.stringify({
      title: 'About',
      blocks: [{
        heading: 'Shop',
        body: 'Come by.',
        media: {
          description: 'shop front',
          query: 'storefront',
          path: 'https://placehold.co/600',
        },
      }],
    }))

    expect(plan?.blocks[0]?.media).toEqual({
      description: 'shop front',
      query: 'storefront',
      path: '',
      altText: '',
      missed: true,
    })
  })
})

describe('matchLibraryAsset', () => {
  it('scores filename and alt text', () => {
    expect(matchLibraryAsset('storefront shop', library)?.path).toBe('/uploads/shop-front.jpg')
    expect(matchLibraryAsset('leather bag', library)?.path).toBe('/uploads/bag.jpg')
    expect(matchLibraryAsset('a yacht in monaco', library)).toBeNull()
  })
})

describe('compileBuildPlan', () => {
  it('emits one insert and never a placeholder URL', () => {
    const parsed = parseBuildPlan(JSON.stringify({
      title: 'About',
      blocks: [{
        heading: 'Visit',
        body: 'Come by.',
        media: { description: 'yacht', query: 'yacht monaco', path: 'https://placehold.co/600' },
      }],
    })).plan!
    const unresolved = compileBuildPlan(parsed)[0]
    expect(unresolved?.op).toBe('insert')
    expect(unresolved && 'html' in unresolved ? unresolved.html : '').not.toContain('placehold.co')
    expect(unresolved && 'html' in unresolved ? unresolved.html : '').not.toContain('<img')

    const resolved = resolvePlanMedia(parsed, library)
    expect(resolved.blocks[0]?.media?.missed).toBe(true)
    const missedHtml = compileBuildPlan(resolved)[0]
    expect(missedHtml && 'html' in missedHtml ? missedHtml.html : '').not.toContain('<img')
  })

  it('uses a library hit as the image src', () => {
    const plan: BuildPlan = {
      title: 'About',
      summary: '',
      blocks: [{
        heading: 'The shop',
        body: 'On the high street.',
        media: { description: 'shop front', query: 'storefront', path: '', altText: '', missed: true },
      }],
    }
    const html = compileBuildPlan(resolvePlanMedia(plan, library))[0]
    expect(html && 'html' in html ? html.html : '').toContain('src="/uploads/shop-front.jpg"')
    expect(html && 'html' in html ? html.html : '').toContain('alt="The storefront"')
  })

  it('escapes copy so a heading cannot inject markup', () => {
    const html = compileBuildPlan({
      title: 'x',
      summary: '',
      blocks: [{ heading: '<script>alert(1)</script>', body: 'a & b', media: null }],
    })[0]
    const markup = html && 'html' in html ? html.html : ''
    expect(markup).toContain('&lt;script&gt;')
    expect(markup).toContain('a &amp; b')
    expect(markup).not.toContain('<script>')
  })
})
