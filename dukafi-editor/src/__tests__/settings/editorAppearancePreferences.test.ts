import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  EDITOR_PREFS_KEY,
  applyEditorAppearancePreferencesToDocument,
  readEditorSelectPreference,
  setEditorSelectPreference,
} from '@site/preferences/editorPreferences'

function resetAppearanceState() {
  localStorage.clear()
  document.documentElement.removeAttribute('data-editor-density')
  document.documentElement.removeAttribute('data-editor-theme')
  document.documentElement.removeAttribute('data-editor-text-scale')
}

beforeEach(resetAppearanceState)
afterEach(resetAppearanceState)

describe('editor appearance preferences', () => {
  it('defaults to light theme and default text size without changing density', () => {
    // Light is the product default; dark chrome is opt-in.
    expect(readEditorSelectPreference('theme')).toBe('light')
    expect(readEditorSelectPreference('textScale')).toBe('default')
    expect(readEditorSelectPreference('density')).toBe('compact')
  })

  it('persists theme and text size with the rest of the editor prefs', () => {
    setEditorSelectPreference('theme', 'dark')
    setEditorSelectPreference('textScale', 'large')

    const stored = JSON.parse(localStorage.getItem(EDITOR_PREFS_KEY) ?? '{}')
    expect(stored.theme).toBe('dark')
    expect(stored.textScale).toBe('large')
  })

  it('applies appearance preferences to the document root for global token scopes', () => {
    applyEditorAppearancePreferencesToDocument(document, {
      density: 'comfortable',
      theme: 'light',
      textScale: 'extra-large',
    })

    expect(document.documentElement.getAttribute('data-editor-density')).toBe('comfortable')
    expect(document.documentElement.getAttribute('data-editor-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-editor-text-scale')).toBe('extra-large')
  })
})
