import { describe, it, expect } from 'bun:test'
import { renderNode, publishPage, type RenderConfig } from '@core/publisher'
import type { ModuleDefinition } from '@core/module-engine'
import { makeModule, makeRegistry, makePage, makeSite, makeAccumulators } from './helpers'

// ---------------------------------------------------------------------------
// annotateNodeIds — editor-only uid injection (agent read-surface)
// ---------------------------------------------------------------------------

const headingDef: ModuleDefinition<{ text: string; level: number }> = makeModule('base.text', {
  render: (props) => ({ html: `<h${props.level}>${props.text}</h${props.level}>` }),
})

const containerDef: ModuleDefinition<{ className: string }> = makeModule('base.container', {
  canHaveChildren: true,
  render: (props, children) => ({
    html: `<div class="${props.className}">${children.join('')}</div>`,
  }),
})

// A module that emits no element wrapper — its node is "unannotatable".
const commentDef: ModuleDefinition = makeModule('test.comment', {
  render: () => ({ html: '<!-- no element here -->' }),
})

const registry = makeRegistry({
  'base.text': headingDef,
  'base.container': containerDef,
  'test.comment': commentDef,
})
const site = makeSite()

function ctx(page: ReturnType<typeof makePage>, annotateNodeIds?: boolean): RenderConfig {
  return { page, site, registry, breakpointId: undefined, annotateNodeIds }
}

const nestedPage = () =>
  makePage({
    root: { moduleId: 'base.container', props: { className: 'wrapper' }, children: ['c1', 'c2'] },
    c1: { moduleId: 'base.text', props: { text: 'A', level: 2 } },
    c2: { moduleId: 'base.text', props: { text: 'B', level: 3 } },
  })

describe('renderNode — annotateNodeIds off (default)', () => {
  it('emits clean, id-less HTML byte-identical to a no-flag render', () => {
    const page = nestedPage()
    const off = renderNode('root', ctx(page), makeAccumulators())
    const undef = renderNode('root', ctx(page, undefined), makeAccumulators())
    expect(off).toBe('<div class="wrapper"><h2>A</h2><h3>B</h3></div>')
    expect(off).toBe(undef)
    expect(off).not.toContain('uid=')
  })

  it('publishPage default output carries no uid (clean-HTML rule)', () => {
    const page = nestedPage()
    const { html } = publishPage(page, site, registry)
    expect(html).not.toContain('uid=')
  })
})

describe('renderNode — annotateNodeIds on', () => {
  it('annotates every node\'s outermost element with its uid', () => {
    const page = nestedPage()
    const html = renderNode('root', ctx(page, true), makeAccumulators())
    expect(html).toBe(
      '<div uid="root" class="wrapper">' +
        '<h2 uid="c1">A</h2>' +
        '<h3 uid="c2">B</h3>' +
        '</div>',
    )
  })

  it('inserts uid as the first attribute, preserving existing attrs', () => {
    const page = makePage({ root: { moduleId: 'base.text', props: { text: 'Hi', level: 1 } } })
    expect(renderNode('root', ctx(page, true), makeAccumulators())).toBe('<h1 uid="root">Hi</h1>')
  })

  it('leaves a node that emits no element tag unannotated (unannotatable)', () => {
    const page = makePage({ root: { moduleId: 'test.comment', props: {} } })
    const html = renderNode('root', ctx(page, true), makeAccumulators())
    expect(html).toBe('<!-- no element here -->')
    expect(html).not.toContain('uid=')
  })

  it('publishPage threads annotateNodeIds into the body render', () => {
    const page = nestedPage()
    const { html } = publishPage(page, site, registry, { annotateNodeIds: true })
    expect(html).toContain('uid="root"')
    expect(html).toContain('uid="c1"')
    expect(html).toContain('uid="c2"')
  })
})
