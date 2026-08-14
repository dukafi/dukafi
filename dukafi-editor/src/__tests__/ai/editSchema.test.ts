/**
 * The envelope between "something proposed a change" and "the page changed".
 *
 * Everything here is about tolerance. A model gets four edits right and one
 * wrong constantly, and the merchant is better served by four applied changes
 * and a note than by a refusal — the same call `parseBlockExport` makes for a
 * hand-pasted block.
 */

import { describe, expect, it } from 'bun:test'
import { extractEditsFromReply, parseAiEdits, MAX_EDITS_PER_REPLY } from '@core/ai'

describe('parseAiEdits', () => {
  it('keeps each well-formed operation', () => {
    const edits = parseAiEdits([
      { op: 'insert', parentId: 'a', html: '<p>hi</p>' },
      { op: 'replace', nodeId: 'b', html: '<p>bye</p>' },
      { op: 'delete', nodeId: 'c' },
      { op: 'setProps', nodeId: 'd', props: { text: 'x' } },
    ])

    expect(edits.map((e) => e.op)).toEqual(['insert', 'replace', 'delete', 'setProps'])
  })

  it('treats a missing parentId as the document root', () => {
    const [edit] = parseAiEdits([{ op: 'insert', html: '<p>hi</p>' }])

    expect(edit).toEqual({ op: 'insert', html: '<p>hi</p>' })
  })

  it('drops a bad edit but keeps its neighbours', () => {
    const edits = parseAiEdits([
      { op: 'insert', html: '<p>good</p>' },
      { op: 'insert' },                       // no html
      { op: 'teleport', nodeId: 'x' },        // unknown op
      { op: 'delete', nodeId: '' },           // empty id
      { op: 'delete', nodeId: 'keep' },
    ])

    expect(edits).toEqual([{ op: 'insert', html: '<p>good</p>' }, { op: 'delete', nodeId: 'keep' }])
  })

  it('returns nothing for input that is not a list of edits', () => {
    expect(parseAiEdits(null)).toEqual([])
    expect(parseAiEdits({ op: 'insert', html: '<p>x</p>' })).toEqual([])
    expect(parseAiEdits('insert a hero')).toEqual([])
  })

  // A runaway generation is not a plan.
  it('caps how many edits one reply may carry', () => {
    const many = Array.from({ length: MAX_EDITS_PER_REPLY + 10 }, () => ({
      op: 'delete', nodeId: 'n',
    }))

    expect(parseAiEdits(many)).toHaveLength(MAX_EDITS_PER_REPLY)
  })
})

describe('extractEditsFromReply', () => {
  it('pulls the edits out of a fenced block and keeps the prose', () => {
    const { edits, text } = extractEditsFromReply(
      'Added a hero for you.\n\n```json\n{"edits":[{"op":"insert","html":"<h1>Hi</h1>"}]}\n```',
    )

    expect(edits).toHaveLength(1)
    expect(text).toBe('Added a hero for you.')
  })

  it('accepts a bare array as well as an edits object', () => {
    const { edits } = extractEditsFromReply('```json\n[{"op":"delete","nodeId":"a"}]\n```')

    expect(edits).toEqual([{ op: 'delete', nodeId: 'a' }])
  })

  // An answer to a question carries no edits and must apply nothing.
  it('returns no edits when the model only replied in prose', () => {
    const { edits, text } = extractEditsFromReply('You add a cart region from the Properties panel.')

    expect(edits).toEqual([])
    expect(text).toBe('You add a cart region from the Properties panel.')
  })

  // Models illustrate with HTML fences constantly; those are not instructions.
  it('ignores a fenced block that is not an edit batch', () => {
    const { edits, text } = extractEditsFromReply(
      'Something like this:\n\n```html\n<div class="flex">x</div>\n```',
    )

    expect(edits).toEqual([])
    expect(text).toContain('<div class="flex">x</div>')
  })

  // The exact failure mode qwen2.5-coder:7b produced on the first commerce
  // prompt: correct markup, correct overlay attributes, and a JavaScript
  // template literal instead of a JSON string. Backticks mean nothing in JSON,
  // so re-quoting the value can only rescue a reply that would otherwise have
  // been discarded whole.
  it('rescues a reply that used a backtick literal for the html', () => {
    const tick = String.fromCharCode(96)
    const { edits } = extractEditsFromReply(
      ['```json', '{ "edits": [ { "op": "insert", "parentId": "hero1", "html": ' +
        tick + '<button data-dukafy-action="cart.addItem">Add</button>' + tick + ' } ] }', '```'].join('\n'),
    )

    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ op: 'insert', parentId: 'hero1' })
    expect((edits[0] as { html: string }).html).toContain('data-dukafy-action')
  })

  it('survives malformed JSON in the fence', () => {
    const { edits } = extractEditsFromReply('```json\n{"edits": [ oops\n```')

    expect(edits).toEqual([])
  })
})
