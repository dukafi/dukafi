/**
 * Commerce → Settings → Appearance.
 *
 * The theme control already existed in the global Settings modal, filed under
 * a group labelled "Editor" — which reads like it does not apply to a merchant
 * who lives in Commerce and never opens the canvas. Surfacing it here is a
 * second view of the SAME preference, not a second preference: the two must
 * never be able to disagree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsSection } from '@admin/pages/dashboard/sections/SettingsSection'
import {
  readEditorSelectPreference,
  setEditorSelectPreference,
} from '@site/preferences/editorPreferences'

beforeEach(() => {
  localStorage.clear()
  // The commerce settings fetch is irrelevant here; failing it exercises the
  // path that matters — appearance must render even when the API is down.
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch
})
afterEach(cleanup)

describe('Commerce appearance settings', () => {
  it('renders the theme control even when commerce settings fail to load', async () => {
    render(<SettingsSection />)

    // A merchant must never be locked out of switching to light because an
    // unrelated API call failed.
    await waitFor(() => expect(screen.getByLabelText('Theme')).toBeDefined())
  })

  it('writes through to the shared preference', async () => {
    render(<SettingsSection />)
    const select = await screen.findByLabelText('Theme')

    fireEvent.change(select, { target: { value: 'dark' } })

    expect(readEditorSelectPreference('theme')).toBe('dark')
  })

  it('reflects a change made elsewhere, so the two surfaces cannot diverge', async () => {
    render(<SettingsSection />)
    // `Select` renders a readonly combobox input over a hidden native select,
    // so the merchant-visible state is that input's value (the option LABEL).
    const trigger = await screen.findByLabelText('Theme') as HTMLInputElement
    // Light is the product default.
    expect(trigger.value).toBe('Light')

    // Simulates the global Settings modal changing it in the same session.
    setEditorSelectPreference('theme', 'dark')

    await waitFor(() => {
      expect((screen.getByLabelText('Theme') as HTMLInputElement).value).toBe('Dark')
    })
  })
})
