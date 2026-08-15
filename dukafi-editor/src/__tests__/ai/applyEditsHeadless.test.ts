/**
 * `applyEditsToTree` without an editor.
 *
 * This is the premise the MCP write path rests on: the edit pipeline runs with
 * no store, no React, no open tab — only a plain document object. If these
 * tests ever need a store to pass, the headless path has quietly regressed and
 * writes would once again require the merchant to be sitting with the editor
 * open, which is unusable for a cloud agent working asynchronously.
 *
 * The store's `applyAiEdits` is a thin wrapper that adds one undo step; its
 * behaviour is covered elsewhere. What is asserted here is that nothing in the
 * wrapper was load-bearing.
 */

import { describe, expect, it } from 'bun:test'
import { applyEditsToTree, type EditableSite, type EditableTree } from '@core/ai'
import '@modules/base'

function emptyPage(): EditableTree {
  return {
    rootNodeId: 'root',
    nodes: {
      root: {
        id: 'root', moduleId: 'base.body', children: [],
        props: {}, classIds: [], breakpointOverrides: {},
      } as never,
    },
  }
}

const emptySite = (): EditableSite => ({ styleRules: {} })

describe('applyEditsToTree — headless', () => {
  it('inserts authored HTML as real nodes', () => {
    const tree = emptyPage()
    const site = emptySite()

    const applied = applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<h1>Summer sale</h1>' },
    ])

    expect(applied).toBe(1)
    expect(tree.nodes.root.children).toHaveLength(1)
    const inserted = tree.nodes[tree.nodes.root.children[0]]
    expect(inserted.moduleId).toBe('base.text')
  })

  // The whole reason the write path takes HTML rather than node JSON: Tailwind
  // classes survive verbatim, linked into the site's style rules.
  it('preserves Tailwind classes and registers them on the site', () => {
    const tree = emptyPage()
    const site = emptySite()

    applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<div class="mx-auto flex max-w-sm gap-5"></div>' },
    ])

    const inserted = tree.nodes[tree.nodes.root.children[0]]
    expect(inserted.classIds).toHaveLength(4)
    const names = inserted.classIds.map((id) => site.styleRules[id]?.name)
    expect(names).toEqual(['mx-auto', 'flex', 'max-w-sm', 'gap-5'])
  })

  // Two inserts naming the same class must share one style rule, or the
  // published stylesheet fills with duplicates.
  it('reuses a style rule when two edits name the same class', () => {
    const tree = emptyPage()
    const site = emptySite()

    applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<div class="flex"></div>' },
      { op: 'insert', parentId: 'root', html: '<span class="flex"></span>' },
    ])

    expect(Object.keys(site.styleRules)).toHaveLength(1)
  })

  // Commerce overlays cannot be expressed in plain HTML, which is why the
  // importer maps `data-dukafy-*` onto them. A store agent is useless without.
  it('carries commerce actions in from data-dukafy attributes', () => {
    const tree = emptyPage()
    const site = emptySite()

    applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<button data-dukafy-action="cart.addItem">Add</button>' },
    ])

    const inserted = tree.nodes[tree.nodes.root.children[0]]
    expect(inserted.actions?.click?.type).toBe('cart.addItem')
  })

  it('deletes a node and everything under it', () => {
    const tree = emptyPage()
    const site = emptySite()
    applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<div><span>inner</span></div>' },
    ])
    const target = tree.nodes.root.children[0]
    const before = Object.keys(tree.nodes).length

    const applied = applyEditsToTree(tree, site, [{ op: 'delete', nodeId: target }])

    expect(applied).toBe(1)
    expect(tree.nodes.root.children).toHaveLength(0)
    expect(Object.keys(tree.nodes).length).toBeLessThan(before)
  })

  // A model asked to restyle reaches for setProps with a `class` key whatever
  // the prompt says. Written straight through it lands in `props.class`, which
  // nothing renders — a silent no-op counted as a change.
  it('routes a class prop to classIds instead of dead props', () => {
    const tree = emptyPage()
    const site = emptySite()
    applyEditsToTree(tree, site, [{ op: 'insert', parentId: 'root', html: '<p>hi</p>' }])
    const target = tree.nodes.root.children[0]

    applyEditsToTree(tree, site, [
      { op: 'setProps', nodeId: target, props: { class: 'text-xl font-bold' } },
    ])

    expect(tree.nodes[target].props.class).toBeUndefined()
    expect(tree.nodes[target].classIds.map((id) => site.styleRules[id]?.name))
      .toEqual(['text-xl', 'font-bold'])
  })

  // One bad reference must not discard the good edits either side of it.
  it('skips an edit naming a node that does not exist and keeps going', () => {
    const tree = emptyPage()
    const site = emptySite()

    const applied = applyEditsToTree(tree, site, [
      { op: 'insert', parentId: 'root', html: '<p>one</p>' },
      { op: 'delete', nodeId: 'no-such-node' },
      { op: 'insert', parentId: 'root', html: '<p>two</p>' },
    ])

    expect(applied).toBe(2)
    expect(tree.nodes.root.children).toHaveLength(2)
  })

  // Removing the root would leave nothing to edit.
  it('refuses to delete the document root', () => {
    const tree = emptyPage()

    expect(applyEditsToTree(tree, emptySite(), [{ op: 'delete', nodeId: 'root' }])).toBe(0)
    expect(tree.nodes.root).toBeDefined()
  })

  it('reports nothing applied for an empty batch', () => {
    expect(applyEditsToTree(emptyPage(), emptySite(), [])).toBe(0)
  })
})
