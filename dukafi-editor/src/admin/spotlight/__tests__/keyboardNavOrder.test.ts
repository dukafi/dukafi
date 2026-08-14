/**
 * Regression test: keyboard navigation index must match the visual rendering
 * order.
 *
 * The rendered command list is grouped by `CommandGroup`. The linear arrow-key
 * index used for keyboard navigation is built by `getMergedCommandList` /
 * `getCappedResults`. If those return commands in pure score order (with
 * groups interleaved), pressing Down on the last visible item of group A
 * (which has a lower score than the first item of group B) jumps focus into
 * group B and then back to group A. We saw that bug in the wild: "I am
 * pressing down, it goes down, but then it jumps to the next section, then it
 * jumps back to the current section."
 *
 * Fix: order the scored list by visual grouping (group items together,
 * preserving group first-appearance order and within-group score order) before
 * returning it. This test locks that invariant in.
 */

import { describe, it, expect } from 'bun:test'
import { orderScoredByVisualGroup } from '../spotlightSearch'
import type { ScoredCommand } from '../matcher'
import type { Command, CommandGroup } from '../types'

const NOOP_RUN = () => {}

function mkCmd(id: string, group: CommandGroup): Command {
  return {
    id,
    title: id,
    group,
    workspaces: ['any'],
    run: NOOP_RUN,
  }
}

function mkScored(id: string, group: CommandGroup, score: number): ScoredCommand {
  return { command: mkCmd(id, group), score, matchRanges: [] }
}

describe('orderScoredByVisualGroup', () => {
  it('keeps commands of the same group contiguous', () => {
    // Mixed score order (interleaved groups) — the kind of input
    // `rankCommands` produces when scores vary across groups.
    const input: ScoredCommand[] = [
      mkScored('a1', 'pages', 280),
      mkScored('b1', 'editor', 275),
      mkScored('a2', 'pages', 270),
      mkScored('b2', 'editor', 265),
      mkScored('a3', 'pages', 260),
    ]

    const ordered = orderScoredByVisualGroup(input)
    const groups = ordered.map((s) => s.command.group)

    // Expect [pages, pages, pages, editor, editor] — no interleaving.
    expect(groups).toEqual(['pages', 'pages', 'pages', 'editor', 'editor'])
  })

  it('preserves the order each group first appeared in the scored list', () => {
    const input: ScoredCommand[] = [
      mkScored('e1', 'editor', 100),
      mkScored('p1', 'pages', 90),
      mkScored('s1', 'settings', 80),
      mkScored('e2', 'editor', 70),
      mkScored('p2', 'pages', 60),
    ]

    const ordered = orderScoredByVisualGroup(input)
    const groups = ordered.map((s) => s.command.group)

    // First-appearance order: editor, pages, settings.
    expect(groups).toEqual(['editor', 'editor', 'pages', 'pages', 'settings'])
  })

  it('preserves within-group score order (highest first)', () => {
    const input: ScoredCommand[] = [
      mkScored('a-high', 'pages', 300),
      mkScored('b-high', 'editor', 280),
      mkScored('a-mid', 'pages', 200),
      mkScored('a-low', 'pages', 100),
      mkScored('b-low', 'editor', 90),
    ]

    const ordered = orderScoredByVisualGroup(input)
    const ids = ordered.map((s) => s.command.id)

    expect(ids).toEqual(['a-high', 'a-mid', 'a-low', 'b-high', 'b-low'])
  })

  it('arrow-down progression stays within a section before moving on', () => {
    // Concretely reproduces the user-reported bug: a "Pages" section
    // followed by an "Editor" section, with interleaved scores. After
    // ordering, walking the list one step at a time must visit all of
    // "pages" before any of "editor".
    const interleaved: ScoredCommand[] = [
      mkScored('pages.delete', 'pages', 275),
      mkScored('editor.save', 'editor', 250),
      mkScored('pages.duplicate', 'pages', 275),
      mkScored('editor.publish', 'editor', 250),
      mkScored('pages.rename', 'pages', 275),
    ]

    const ordered = orderScoredByVisualGroup(interleaved)

    // Walk like Down-arrow keystrokes: index 0 → 1 → 2 → ...
    let lastGroup: CommandGroup | null = null
    const seenGroups: CommandGroup[] = []
    for (const item of ordered) {
      if (item.command.group !== lastGroup) {
        seenGroups.push(item.command.group)
        lastGroup = item.command.group
      }
    }

    // Each group should be visited exactly once — never returned to after
    // moving on.
    expect(seenGroups).toEqual(['pages', 'editor'])
    expect(new Set(seenGroups).size).toBe(seenGroups.length)
  })

  it('returns an empty array for empty input', () => {
    expect(orderScoredByVisualGroup([])).toEqual([])
  })
})
