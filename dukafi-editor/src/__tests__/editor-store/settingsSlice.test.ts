/**
 * settingsSlice unit tests.
 *
 * Keep this as workflow coverage for the public slice actions instead of one
 * test per field assignment.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import type { SettingsSection } from '@site/store/slices/settingsSlice'

function resetSettings() {
  useEditorStore.setState({
    isSettingsOpen: false,
    activeSection: 'general' as SettingsSection,
  })
}

function getSettings() {
  const s = useEditorStore.getState()
  return { isSettingsOpen: s.isSettingsOpen, activeSection: s.activeSection }
}

beforeEach(resetSettings)

describe('settingsSlice', () => {
  it('starts closed on the general section', () => {
    expect(getSettings()).toEqual({
      isSettingsOpen: false,
      activeSection: 'general',
    })
  })

  it('opens to general by default and can jump to explicit sections', () => {
    useEditorStore.getState().openSettings()
    expect(getSettings()).toEqual({
      isSettingsOpen: true,
      activeSection: 'general',
    })

    useEditorStore.getState().openSettings('shortcuts')
    expect(getSettings()).toEqual({
      isSettingsOpen: true,
      activeSection: 'shortcuts',
    })
  })

  it('closes without resetting the active section', () => {
    useEditorStore.getState().openSettings('publishing')
    useEditorStore.getState().closeSettings()
    useEditorStore.getState().closeSettings()

    expect(getSettings()).toEqual({
      isSettingsOpen: false,
      activeSection: 'publishing',
    })
  })

  it('setSettingsSection changes the section without opening a closed modal', () => {
    useEditorStore.getState().setSettingsSection('preferences')
    expect(getSettings()).toEqual({
      isSettingsOpen: false,
      activeSection: 'preferences',
    })
  })

  it('accepts every settings section and preserves modal openness while navigating', () => {
    const sections: SettingsSection[] = [
      'general',
      'preferences',
      'shortcuts',
      'publishing',
    ]

    useEditorStore.getState().openSettings('shortcuts')

    for (const section of sections) {
      useEditorStore.getState().setSettingsSection(section)
      expect(getSettings()).toEqual({
        isSettingsOpen: true,
        activeSection: section,
      })
    }
  })

  it('reopens to general unless a specific section is requested', () => {
    useEditorStore.getState().openSettings('shortcuts')
    useEditorStore.getState().closeSettings()
    useEditorStore.getState().openSettings()
    expect(getSettings()).toEqual({
      isSettingsOpen: true,
      activeSection: 'general',
    })

    useEditorStore.getState().closeSettings()
    useEditorStore.getState().openSettings('publishing')
    expect(getSettings()).toEqual({
      isSettingsOpen: true,
      activeSection: 'publishing',
    })
  })
})
