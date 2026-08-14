/**
 * The shipped account block must actually paste.
 *
 * `examples/*.dukafy-block.json` are hand-authored — nothing generates them
 * from types — so a rename in the overlay schemas silently turns them into
 * files that parse to `null` in the paste dialog, or worse, parse with the
 * verbs quietly dropped. This is the only thing standing between that and a
 * merchant pasting a login form whose buttons do nothing.
 */

import { describe, expect, it } from 'bun:test'
import { parseBlockExport } from '@core/page-tree'
import raw from '../../../../examples/account.dukafy-block.json'

const parsed = parseBlockExport(raw)

describe('account example block', () => {
  it('parses as a block', () => {
    expect(parsed).not.toBeNull()
  })

  it('keeps the form region that everything else hangs off', () => {
    expect(parsed!.block.nodes.account.actions?.region).toBe('form')
  })

  it('keeps all three auth verbs', () => {
    const nodes = parsed!.block.nodes
    expect(nodes.signin.actions?.click?.type).toBe('account.login')
    expect(nodes.register.actions?.click?.type).toBe('account.register')
    expect(nodes.signout.actions?.click?.type).toBe('account.logout')
  })

  it('shows the banner only on an error, and binds it to the backend message', () => {
    const banner = parsed!.block.nodes.banner
    expect(banner.visibleWhen).toEqual({ source: 'form', field: 'hasError', operator: 'isTrue' })
    expect(banner.dynamicBindings?.text).toEqual({ source: 'form', field: 'error' })
  })

  it('swaps the form for a greeting once signed in', () => {
    const nodes = parsed!.block.nodes
    expect(nodes.form.visibleWhen).toEqual({ source: 'form', field: 'signedIn', operator: 'isFalse' })
    expect(nodes.welcome.visibleWhen).toEqual({ source: 'form', field: 'signedIn', operator: 'isTrue' })
  })

  it('makes exactly one of the two buttons the form’s real submit button', () => {
    // A form fires ONE submit event and every listening node acts on it, so
    // two submit buttons would both post when the visitor presses Enter. The
    // primary verb owns that event; the secondary stays click-only.
    const nodes = parsed!.block.nodes
    expect(nodes.signin.moduleId).toBe('base.submit')
    expect(nodes.register.moduleId).toBe('base.button')
  })

  it('does not require a name to sign in', () => {
    // `required` on the name field would block the login path, which needs no
    // name — the browser refuses to submit and the button looks broken.
    expect(parsed!.block.nodes.name.props.required).toBe(false)
    expect(parsed!.block.nodes.email.props.required).toBe(true)
  })
})
