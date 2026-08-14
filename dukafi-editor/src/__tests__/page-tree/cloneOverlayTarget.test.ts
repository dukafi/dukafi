/**
 * An overlay trigger points at a NODE ID, and cloning mints new ones.
 *
 * Copied verbatim, a duplicated drawer — or a pasted block, or a saved layout —
 * keeps a trigger aimed at the original's id: it opens the wrong sheet, or
 * nothing. Every other id-bearing field on a node is already remapped here;
 * this one was added later and was missed.
 */

import { describe, expect, it } from 'bun:test'
import { cloneNodeWithRemap } from '@core/page-tree'
import type { PageNode } from '@core/page-tree'

function trigger(target: string): PageNode {
  return {
    id: 'old-trigger', moduleId: 'base.button', props: {}, breakpointOverrides: {},
    children: [], classIds: [], actions: { click: { type: 'overlay.open', target } },
  }
}

describe('cloning an overlay trigger', () => {
  it('repoints the trigger at the cloned overlay', () => {
    const idMap = new Map([['old-trigger', 'new-trigger'], ['old-sheet', 'new-sheet']])

    const cloned = cloneNodeWithRemap(trigger('old-sheet'), { newId: 'new-trigger', idMap })

    expect(cloned.actions?.click?.target).toBe('new-sheet')
  })

  // A trigger deliberately aimed at an overlay elsewhere on the page is not
  // part of the copied subtree, so its target must survive untouched.
  it('leaves a target outside the copied subtree alone', () => {
    const idMap = new Map([['old-trigger', 'new-trigger']])

    const cloned = cloneNodeWithRemap(trigger('sheet-on-another-part-of-the-page'), {
      newId: 'new-trigger', idMap,
    })

    expect(cloned.actions?.click?.target).toBe('sheet-on-another-part-of-the-page')
  })

  it('does not share the actions object with the original', () => {
    const original = trigger('old-sheet')
    const cloned = cloneNodeWithRemap(original, { newId: 'n', idMap: new Map() })

    cloned.actions!.click!.target = 'changed'
    expect(original.actions!.click!.target).toBe('old-sheet')
  })
})
