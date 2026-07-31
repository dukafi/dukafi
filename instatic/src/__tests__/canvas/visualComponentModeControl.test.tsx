/**
 * VisualComponentModeControl — integration tests
 *
 * Tests the floating component-mode control rendered in VC edit mode:
 *   1. Renders null when activeDocument is not a VC
 *   2. Renders the mode label, "Back to page", and the document switcher
 *   3. Back button calls exitVisualComponentMode
 *   4. The switcher shows the current VC name and excludes it from the list
 *
 * Uses @testing-library/react with happy-dom (preloaded via bunfig.toml).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { useEditorStore } from '@site/store/store'
import VisualComponentModeControl from '@site/canvas/VisualComponentModeControl'

// ---------------------------------------------------------------------------
// Store reset helper
// ---------------------------------------------------------------------------

function resetStore() {
  localStorage.clear()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    previousActivePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

// ---------------------------------------------------------------------------
// Fixture: site with one page and one (or two) VCs
// ---------------------------------------------------------------------------

function setupVCMode(): { vcId: string } {
  const store = useEditorStore.getState()
  const site = store.createSite('Test Site')
  const pageId = site.pages[0].id
  useEditorStore.setState({ activePageId: pageId })

  const vcId = store.createVisualComponent('HeroSection')

  act(() => {
    useEditorStore.getState().setActiveDocument({ kind: 'visualComponent', vcId })
  })

  return { vcId }
}

beforeEach(resetStore)
afterEach(cleanup)

// ---------------------------------------------------------------------------
// 1 — Renders null when not in VC mode
// ---------------------------------------------------------------------------

describe('VisualComponentModeControl — renders null when not in VC mode', () => {
  it('returns nothing when activeDocument is null', () => {
    const { container } = render(<VisualComponentModeControl />)
    expect(container.firstChild).toBeNull()
  })

  it('returns nothing when activeDocument.kind is "page"', () => {
    act(() => {
      useEditorStore.getState().createSite('Test Site')
    })
    const { container } = render(<VisualComponentModeControl />)
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2 — Renders the control in VC mode
// ---------------------------------------------------------------------------

describe('VisualComponentModeControl — renders in VC mode', () => {
  it('renders the floating control container', () => {
    setupVCMode()
    render(<VisualComponentModeControl />)
    expect(screen.getByTestId('vc-mode-control')).toBeDefined()
  })

  it('renders the back button', () => {
    setupVCMode()
    render(<VisualComponentModeControl />)
    expect(screen.getByTestId('vc-mode-control-back')).toBeDefined()
  })

  it('renders the "Editing component" mode label', () => {
    setupVCMode()
    render(<VisualComponentModeControl />)
    const control = screen.getByTestId('vc-mode-control')
    expect(control.textContent).toContain('Editing component')
  })

  it('shows the current VC name in the document switcher', () => {
    setupVCMode()
    render(<VisualComponentModeControl />)
    const switcher = screen.getByTestId('document-switcher') as HTMLInputElement
    expect(switcher.getAttribute('placeholder')).toBe('HeroSection')
  })
})

// ---------------------------------------------------------------------------
// 3 — Back button calls exitVisualComponentMode
// ---------------------------------------------------------------------------

describe('VisualComponentModeControl — back button', () => {
  it('calls exitVisualComponentMode when the back button is clicked', () => {
    setupVCMode()
    render(<VisualComponentModeControl />)
    act(() => {
      fireEvent.click(screen.getByTestId('vc-mode-control-back'))
    })
    expect(useEditorStore.getState().activeDocument).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4 — The switcher lists other documents and excludes the current VC
// ---------------------------------------------------------------------------

describe('VisualComponentModeControl — document switcher', () => {
  it('lists other components but excludes the one being edited', () => {
    setupVCMode()
    act(() => {
      useEditorStore.getState().createVisualComponent('OtherComp')
    })
    const { container } = render(<VisualComponentModeControl />)
    const nativeSelect = container.querySelector('select')
    const optionTexts = Array.from(nativeSelect?.querySelectorAll('option') ?? []).map(
      (o) => o.textContent,
    )
    expect(optionTexts).toContain('OtherComp')
    expect(optionTexts).not.toContain('HeroSection')
  })

  it('groups the list with a Pages group header for the seeded page', () => {
    setupVCMode()
    const { container } = render(<VisualComponentModeControl />)
    const nativeSelect = container.querySelector('select')
    const groupLabels = Array.from(nativeSelect?.querySelectorAll('optgroup') ?? []).map((g) =>
      g.getAttribute('label'),
    )
    expect(groupLabels).toContain('Pages')
  })
})
