import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpacingTab } from '@site/panels/SpacingPanel'
import { TypographyTab } from '@site/panels/TypographyPanel'
import { IconsPanel } from '@site/panels/IconsPanel/IconsPanel'
import { ButtonsPanel } from '@site/panels/ButtonsPanel/ButtonsPanel'
import { InputsPanel } from '@site/panels/InputsPanel'
import { useEditorStore } from '@site/store/store'
import type { FontEntry } from '@core/fonts'
import { makeSite } from '../fixtures'

const INTER_FONT: FontEntry = {
  id: 'font-inter',
  source: 'google',
  family: 'Inter',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
  ],
  category: 'Sans Serif',
  createdAt: 1,
  updatedAt: 1,
}

// The scale tabs are chrome-free; wrap them in testid containers so the
// existing scoping queries keep working.
function TypographyPanel() {
  return (
    <div data-testid="typography-panel">
      <TypographyTab />
    </div>
  )
}
function SpacingPanel() {
  return (
    <div data-testid="spacing-panel">
      <SpacingTab />
    </div>
  )
}

function resetStore() {
  useEditorStore.setState({
    site: makeSite(),
    activePageId: 'page-1',
    frameworkPanelOpen: true,
    frameworkPanelTab: 'typography',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(resetStore)
afterEach(cleanup)

describe('FrameworkScalePanel', () => {
  it('hides scale editors and shows type styles and spacing presets', () => {
    render(
      <>
        <TypographyPanel />
        <SpacingPanel />
      </>,
    )

    const typographyPanel = screen.getByTestId('typography-panel')
    const spacingPanel = screen.getByTestId('spacing-panel')

    expect(within(typographyPanel).queryByRole('group', { name: 'Typography scales' })).toBeNull()
    expect(within(spacingPanel).queryByRole('group', { name: 'Spacing scales' })).toBeNull()

    const presets = within(spacingPanel).getByTestId('spacing-presets')
    expect(within(presets).getByLabelText('Container Width')).toBeDefined()
    expect(within(presets).getByLabelText('Card Padding')).toBeDefined()
    expect(within(presets).getByLabelText('Vertical')).toBeDefined()
    expect(within(presets).getByLabelText('Horizontal')).toBeDefined()

    const radius = within(spacingPanel).getByTestId('radius-presets')
    expect(within(radius).getByLabelText('Radius')).toBeDefined()
  })

  it('uses the shared empty state when installed fonts have no font tokens', async () => {
    useEditorStore.setState({
      site: makeSite({
        settings: {
          shortcuts: {},
          fonts: {
            items: [INTER_FONT],
            tokens: [],
          },
        },
      }),
    } as Parameters<typeof useEditorStore.setState>[0])

    render(<TypographyPanel />)

    const typographyPanel = screen.getByTestId('typography-panel')
    await userEvent.click(within(typographyPanel).getByRole('button', { name: 'Font tokens' }))
    const fontTokenEmptyText = within(typographyPanel).getByText('No font tokens yet.')
    const emptyState = fontTokenEmptyText.closest('[role="status"]')

    expect(emptyState).toBeTruthy()
    expect(within(emptyState as HTMLElement).getByRole('button', { name: 'Create token' })).toBeTruthy()
    expect(within(typographyPanel).getAllByRole('button', { name: 'Create token' })).toHaveLength(1)
  })

  it('edits H1–H7 and P as default type styles', async () => {
    render(<TypographyPanel />)

    const typographyPanel = screen.getByTestId('typography-panel')
    await userEvent.click(within(typographyPanel).getByRole('button', { name: 'Type styles' }))
    const typeStyles = screen.getByTestId('type-styles')
    expect(within(typeStyles).getByRole('button', { name: 'H1' })).toBeDefined()
    expect(within(typeStyles).getByRole('button', { name: 'H7' })).toBeDefined()
    expect(within(typeStyles).getByRole('button', { name: 'P' })).toBeDefined()
    expect(within(typeStyles).getByLabelText('Type style font size')).toBeDefined()
  })

  it('snaps spacing presets onto discrete steps', async () => {
    render(<SpacingPanel />)

    const presets = screen.getByTestId('spacing-presets')
    const container = within(presets).getByLabelText('Container Width')
    expect(container).toHaveProperty('value', '2')

    fireEvent.input(container, { target: { value: '0' } })

    expect(useEditorStore.getState().site?.settings.framework?.spacing?.presets?.containerWidth).toBe(
      'narrow',
    )
  })

  it('snaps radius onto discrete steps', () => {
    render(<SpacingPanel />)

    const radius = within(screen.getByTestId('radius-presets')).getByLabelText('Radius')
    expect(radius).toHaveProperty('value', '2')

    fireEvent.input(radius, { target: { value: '4' } })

    expect(useEditorStore.getState().site?.settings.framework?.spacing?.presets?.radius).toBe(
      'full',
    )
  })

  it('snaps icon weight and writes framework.icons', () => {
    render(
      <div data-testid="icons-panel">
        <IconsPanel />
      </div>,
    )

    const panel = screen.getByTestId('icon-presets')
    expect(within(panel).getByLabelText('Color')).toBeDefined()
    expect(within(panel).getByLabelText('Style')).toBeDefined()
    expect(within(panel).getByLabelText('Icon Weight')).toBeDefined()
    expect(within(panel).getByRole('group', { name: 'Fill' })).toBeDefined()
    expect(within(panel).getByLabelText('Treatment')).toBeDefined()
    expect(within(panel).getByRole('group', { name: 'Fill Intensity' })).toBeDefined()
    expect(within(panel).getByLabelText('Padding')).toBeDefined()
    expect(within(panel).getByLabelText('Radius')).toBeDefined()

    fireEvent.input(within(panel).getByLabelText('Icon Weight'), { target: { value: '6' } })
    expect(useEditorStore.getState().site?.settings.framework?.icons?.weight).toBe('7')
  })

  it('edits site-wide button defaults without adding visual props to base.button', () => {
    render(<ButtonsPanel />)

    const panel = screen.getByTestId('button-presets')
    expect(within(panel).getByRole('group', { name: 'Button style' })).toBeDefined()
    expect(within(panel).getByLabelText('Color')).toBeDefined()
    expect(within(panel).getByLabelText('Padding')).toBeDefined()
    expect(within(panel).getByLabelText('Radius')).toBeDefined()
    expect(within(panel).getByLabelText('Font')).toBeDefined()
    expect(within(panel).getByLabelText('Font Size')).toBeDefined()
    expect(within(panel).getByLabelText('Font Weight')).toBeDefined()
    expect(within(panel).getByRole('group', { name: 'Case' })).toBeDefined()
    expect(within(panel).getByLabelText('Letter Spacing')).toBeDefined()

    fireEvent.input(within(panel).getByLabelText('Padding'), { target: { value: '6' } })
    expect(useEditorStore.getState().site?.settings.framework?.buttons?.padding).toBe('7')
  })

  it('edits site-wide defaults for text inputs, textareas, and selects', () => {
    render(<InputsPanel />)
    const panel = screen.getByTestId('input-presets')
    expect(within(panel).getByLabelText('Background color')).toBeDefined()
    expect(within(panel).getByLabelText('Text color')).toBeDefined()
    expect(within(panel).getByLabelText('Border color')).toBeDefined()
    expect(within(panel).getByLabelText('Focus color')).toBeDefined()
    expect(within(panel).getByLabelText('Padding')).toBeDefined()
    expect(within(panel).getByLabelText('Stroke')).toBeDefined()
    expect(within(panel).getByLabelText('Radius')).toBeDefined()
    expect(within(panel).getByLabelText('Input font')).toBeDefined()
    expect(within(panel).getByLabelText('Font Size')).toBeDefined()
    expect(within(panel).getByLabelText('Font Weight')).toBeDefined()

    fireEvent.input(within(panel).getByLabelText('Stroke'), { target: { value: '5' } })
    expect(useEditorStore.getState().site?.settings.framework?.inputs?.borderWidth).toBe('6')
  })
})
