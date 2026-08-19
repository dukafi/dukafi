/**
 * `applyAiEdits` — the only path an AI reply takes into the document.
 *
 * The load-bearing property is the LAST test in this file: a whole reply is one
 * undo step. Edits are applied without a confirmation dialog, so Cmd+Z is the
 * merchant's entire safety net, and undoing four of five changes would be worse
 * than not applying them at all.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import '@modules/base/index'
import '@modules/store/index'
import { extractEditsFromReply, type AiEdit, type BuildPlan } from '@core/ai'

function freshStore() {
  localStorage.clear()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeDocument: null,
    aiMessages: [],
    aiPending: false,
    aiNeedProfile: false,
    aiBuildRequest: null,
    aiPlan: null,
    aiPlanNote: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(freshStore)

function seedSite() {
  const site = useEditorStore.getState().createSite('AI Site')
  return { rootId: site.pages[0].rootNodeId }
}

const page = () => useEditorStore.getState().site!.pages[0]
const apply = (edits: AiEdit[]) => useEditorStore.getState().applyAiEdits(edits)

describe('applyAiEdits', () => {
  it('inserts HTML as real editable nodes', () => {
    const { rootId } = seedSite()

    const applied = apply([{ op: 'insert', html: '<section><h1>Everything for your day</h1></section>' }])

    expect(applied).toBe(1)
    const root = page().nodes[rootId]!
    expect(root.children).toHaveLength(1)
    const section = page().nodes[root.children[0]!]!
    expect(section.children).toHaveLength(1)
  })

  // The reason HTML is the payload: the model writes Tailwind and the classes
  // become real style rules with no CSS authoring anywhere.
  it('turns Tailwind classes into linked style rules', () => {
    seedSite()

    apply([{ op: 'insert', html: '<div class="mx-auto flex gap-4">hi</div>' }])

    const inserted = Object.values(page().nodes).find((n) => n.classIds.length === 3)!
    const names = inserted.classIds.map((id) => useEditorStore.getState().site!.styleRules[id]!.name)
    expect(names).toEqual(['mx-auto', 'flex', 'gap-4'])
  })

  // Two inserts naming the same utility must share one rule, not race to
  // create two — which is why the name index is built once per batch.
  it('reuses one style rule when two edits name the same class', () => {
    seedSite()

    apply([
      { op: 'insert', html: '<div class="flex">a</div>' },
      { op: 'insert', html: '<div class="flex">b</div>' },
    ])

    const flexRules = Object.values(useEditorStore.getState().site!.styleRules)
      .filter((rule) => rule.name === 'flex')
    expect(flexRules).toHaveLength(1)
  })

  it('carries commerce overlays in from data attributes', () => {
    seedSite()

    apply([{
      op: 'insert',
      html: '<button data-dukafy-action="cart.addItem" data-dukafy-visible-when="currentEntry.inCart:isFalse">Add</button>',
    }])

    const button = Object.values(page().nodes).find((n) => n.moduleId === 'base.button')!
    expect(button.actions?.click?.type).toBe('cart.addItem')
    expect(button.visibleWhen?.operator).toBe('isFalse')
  })

  it('replaces a node in place', () => {
    const { rootId } = seedSite()
    apply([{ op: 'insert', html: '<p>old</p>' }])
    const oldId = page().nodes[rootId]!.children[0]!

    const applied = apply([{ op: 'replace', nodeId: oldId, html: '<h2>new</h2>' }])

    expect(applied).toBe(1)
    expect(page().nodes[oldId]).toBeUndefined()
    expect(page().nodes[rootId]!.children).toHaveLength(1)
  })

  it('deletes a node and everything under it', () => {
    const { rootId } = seedSite()
    apply([{ op: 'insert', html: '<section><p>inner</p></section>' }])
    const sectionId = page().nodes[rootId]!.children[0]!
    const innerId = page().nodes[sectionId]!.children[0]!

    apply([{ op: 'delete', nodeId: sectionId }])

    expect(page().nodes[sectionId]).toBeUndefined()
    expect(page().nodes[innerId]).toBeUndefined()
    expect(page().nodes[rootId]!.children).toHaveLength(0)
  })

  // A small text change must not cost the node its classes and behaviour, which
  // re-emitting it as HTML would.
  it('sets props without disturbing classes or overlays', () => {
    seedSite()
    apply([{ op: 'insert', html: '<p class="text-lg" data-dukafy-bind-text="currentEntry.title">x</p>' }])
    const textNode = Object.values(page().nodes).find((n) => n.dynamicBindings?.text)!

    apply([{ op: 'setProps', nodeId: textNode.id, props: { text: 'Updated' } }])

    const node = page().nodes[textNode.id]!
    expect(node.props.text).toBe('Updated')
    expect(node.classIds).toHaveLength(1)
    expect(node.dynamicBindings?.text?.field).toBe('title')
  })

  // ── Restyling ────────────────────────────────────────────────────────────

  it('replaces an element\'s classes', () => {
    seedSite()
    apply([{ op: 'insert', html: '<div class="p-2">x</div>' }])
    const node = Object.values(page().nodes).find((n) => n.classIds.length === 1)!

    apply([{ op: 'setClasses', nodeId: node.id, classes: 'mx-auto flex gap-4' }])

    const rules = useEditorStore.getState().site!.styleRules
    expect(page().nodes[node.id]!.classIds.map((id) => rules[id]!.name))
      .toEqual(['mx-auto', 'flex', 'gap-4'])
  })

  it('strips every class when given an empty list', () => {
    seedSite()
    apply([{ op: 'insert', html: '<div class="p-2 flex">x</div>' }])
    const node = Object.values(page().nodes).find((n) => n.classIds.length === 2)!

    apply([{ op: 'setClasses', nodeId: node.id, classes: '' }])

    expect(page().nodes[node.id]!.classIds).toEqual([])
  })

  // The failure that prompted this: asked to "style this using tailwindcss",
  // the model sent 22 setProps edits carrying a `class` key. Classes are not
  // props, so all 22 landed in `props.class` — rendered by nothing, reported as
  // 22 applied changes. Routed to classIds instead, the obvious phrasing works.
  it('routes a class prop to the class list instead of a dead prop', () => {
    seedSite()
    apply([{ op: 'insert', html: '<div>x</div>' }])
    const node = Object.values(page().nodes).find((n) => n.moduleId === 'base.container')!

    apply([{ op: 'setProps', nodeId: node.id, props: { class: 'rounded-lg bg-white' } }])

    const updated = page().nodes[node.id]!
    const rules = useEditorStore.getState().site!.styleRules
    expect(updated.classIds.map((id) => rules[id]!.name)).toEqual(['rounded-lg', 'bg-white'])
    expect(updated.props.class).toBeUndefined()
  })

  it('accepts the className spelling too', () => {
    seedSite()
    apply([{ op: 'insert', html: '<div>x</div>' }])
    const node = Object.values(page().nodes).find((n) => n.moduleId === 'base.container')!

    apply([{ op: 'setProps', nodeId: node.id, props: { className: 'flex' } }])

    const rules = useEditorStore.getState().site!.styleRules
    expect(page().nodes[node.id]!.classIds.map((id) => rules[id]!.name)).toEqual(['flex'])
  })

  // A mixed edit must still deliver the non-class props.
  it('applies other props alongside a class change', () => {
    seedSite()
    apply([{ op: 'insert', html: '<p>old</p>' }])
    const node = Object.values(page().nodes).find((n) => n.moduleId === 'base.text')!

    apply([{ op: 'setProps', nodeId: node.id, props: { class: 'text-xl', text: 'new' } }])

    const updated = page().nodes[node.id]!
    expect(updated.props.text).toBe('new')
    expect(updated.classIds).toHaveLength(1)
  })

  // ── Refusals ─────────────────────────────────────────────────────────────

  it('refuses to delete or replace the document root', () => {
    const { rootId } = seedSite()

    expect(apply([{ op: 'delete', nodeId: rootId }])).toBe(0)
    expect(apply([{ op: 'replace', nodeId: rootId, html: '<p>x</p>' }])).toBe(0)
    expect(page().nodes[rootId]).toBeDefined()
  })

  it('ignores an edit naming a node that does not exist', () => {
    seedSite()

    expect(apply([{ op: 'delete', nodeId: 'ghost' }])).toBe(0)
    expect(apply([{ op: 'setProps', nodeId: 'ghost', props: { text: 'x' } }])).toBe(0)
  })

  it('applies the good edits in a batch and reports the count', () => {
    seedSite()

    const applied = apply([
      { op: 'insert', html: '<p>one</p>' },
      { op: 'delete', nodeId: 'ghost' },
      { op: 'insert', html: '<p>two</p>' },
    ])

    expect(applied).toBe(2)
  })

  // ── The safety net ───────────────────────────────────────────────────────

  it('makes an entire reply one undo step', () => {
    const { rootId } = seedSite()
    const before = page().nodes[rootId]!.children.length

    apply([
      { op: 'insert', html: '<h1 class="text-4xl">Title</h1>' },
      { op: 'insert', html: '<p class="text-sm">Subtext</p>' },
      { op: 'insert', html: '<a class="underline" href="/products">Shop</a>' },
    ])
    expect(page().nodes[rootId]!.children).toHaveLength(before + 3)

    useEditorStore.getState().undo()

    expect(page().nodes[rootId]!.children).toHaveLength(before)
  })

  // The whole loop, from a realistic model reply to editable nodes. The string
  // below is exactly what a provider returned through the Ruby proxy during
  // end-to-end verification, prose and fence included.
  it('turns a real model reply into a styled, wired section', () => {
    const { rootId } = seedSite()
    const reply = [
      'Added a hero for you.',
      '',
      '```json',
      '{"edits":[{"op":"insert","html":"<section class=\\"mx-auto max-w-3xl p-8\\">'
        + '<h1 class=\\"text-4xl font-bold\\">Everything for your day</h1>'
        + '<button data-dukafy-action=\\"cart.addItem\\" class=\\"rounded bg-black px-4 py-2 text-white\\">'
        + 'Add to cart</button></section>"}]}',
      '```',
    ].join('\n')

    const { edits, text } = extractEditsFromReply(reply)
    expect(text).toBe('Added a hero for you.')
    expect(apply(edits)).toBe(1)

    const section = page().nodes[page().nodes[rootId]!.children[0]!]!
    const rules = useEditorStore.getState().site!.styleRules
    expect(section.classIds.map((id) => rules[id]!.name)).toEqual(['mx-auto', 'max-w-3xl', 'p-8'])

    const button = Object.values(page().nodes).find((n) => n.moduleId === 'base.button')!
    expect(button.actions?.click?.type).toBe('cart.addItem')
    expect(button.classIds.map((id) => rules[id]!.name)).toContain('bg-black')

    // And the merchant's one safety net still covers all of it.
    useEditorStore.getState().undo()
    expect(page().nodes[rootId]!.children).toHaveLength(0)
  })

  it('applies an approved Build plan as one undo step', () => {
    const { rootId } = seedSite()
    const plan: BuildPlan = {
      title: 'About us',
      summary: 'A short story.',
      blocks: [
        { heading: 'Started in 2019', body: 'Same-day sewing for Nairobi offices.', media: null },
        { heading: 'Visit', body: 'Come by the shop.', media: { description: 'yacht', query: 'yacht', path: 'https://placehold.co/600', altText: '', missed: true } },
      ],
    }

    useEditorStore.setState({ aiPlan: plan, aiPlanNote: 'Added the section.' })
    useEditorStore.getState().applyAiPlan()

    expect(useEditorStore.getState().aiPlan).toBeNull()
    expect(useEditorStore.getState().aiMessages.at(-1)?.applied).toBe(1)
    expect(page().nodes[rootId]!.children).toHaveLength(1)
    expect(Object.values(page().nodes).some((node) => node.moduleId === 'base.image')).toBe(false)

    useEditorStore.getState().undo()
    expect(page().nodes[rootId]!.children).toHaveLength(0)
  })

  it('does nothing, and records nothing, for an empty batch', () => {
    const { rootId } = seedSite()
    const canUndoBefore = useEditorStore.getState().canUndo

    expect(apply([])).toBe(0)
    expect(page().nodes[rootId]!.children).toHaveLength(0)
    expect(useEditorStore.getState().canUndo).toBe(canUndoBefore)
  })
})
