import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import { makeSite } from '../fixtures'

function resetStore() {
  useEditorStore.setState({
    site: makeSite(),
    activePageId: 'page-1',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(resetStore)

describe('generateColorSchemeFromColor', () => {
  it('creates six tokens and a scheme from one seed without existing colors', () => {
    expect(useEditorStore.getState().site?.settings.framework?.colors?.tokens ?? []).toHaveLength(0)

    const scheme = useEditorStore.getState().generateColorSchemeFromColor('#2563eb')
    expect(scheme).not.toBeNull()
    expect(scheme!.slug).toBe('scheme-1')
    expect(scheme!.roles.accent).toBe('scheme-1-accent')

    const tokens = useEditorStore.getState().site!.settings.framework!.colors.tokens
    expect(tokens).toHaveLength(6)
    expect(tokens.map((token) => token.slug)).toEqual([
      'scheme-1-background',
      'scheme-1-secondary',
      'scheme-1-heading',
      'scheme-1-body',
      'scheme-1-accent',
      'scheme-1-border',
    ])

    const stored = useEditorStore.getState().site!.settings.framework!.colorSchemes!.schemes
    expect(stored).toHaveLength(1)
    expect(stored[0]!.roles.background).toBe('scheme-1-background')
  })
})
