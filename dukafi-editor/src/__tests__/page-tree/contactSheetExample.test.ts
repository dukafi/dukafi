/**
 * The shipped contact-sheet template.
 *
 * Hand-authored JSON, like the other examples — nothing generates it from
 * types, so a rename in the overlay or action schemas turns it into a file
 * that parses with its behaviour quietly dropped.
 */

import { describe, expect, it } from 'bun:test'
import { parseBlockExport } from '@core/page-tree'
import raw from '../../../../examples/contact-sheet.dukafy-block.json'

const parsed = parseBlockExport(raw)

describe('contact sheet example', () => {
  it('parses as a block', () => {
    expect(parsed).not.toBeNull()
  })

  it('is a right-hand sheet', () => {
    expect(parsed!.block.nodes.sheet.actions?.overlay).toBe('sheet-right')
  })

  it('opens from the trigger and closes from inside', () => {
    expect(parsed!.block.nodes.trigger.actions?.click)
      .toEqual({ type: 'overlay.open', target: 'sheet' })
    // No target: closes the overlay it sits inside.
    expect(parsed!.block.nodes.close.actions?.click).toEqual({ type: 'overlay.close' })
  })

  // A phone number that does not dial is decoration.
  it('makes the phone number tappable', () => {
    expect(parsed!.block.nodes.phone.props.href).toBe('tel:+254700000000')
    expect(parsed!.block.nodes.email.props.href).toContain('mailto:')
  })

  // `cms` mode is what routes the submission to /forms/<id> so it is stored;
  // `custom` would post nowhere.
  it('stores submissions through the CMS form route', () => {
    const form = parsed!.block.nodes.form
    expect(form.props.mode).toBe('cms')
    expect(form.props.formId).toBe('contact')
  })

  it('collects a name, an email and a message', () => {
    const names = ['name', 'emailfield', 'message']
      .map((id) => parsed!.block.nodes[id]!.props.name)
    expect(names).toEqual(['name', 'email', 'message'])
  })
})
