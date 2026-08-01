import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PropertiesPanel } from '@site/panels/PropertiesPanel/PropertiesPanel'
import { useEditorStore } from '@site/store/store'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

afterEach(cleanup)

function resetStore() {
  localStorage.clear()
  const home = makePage({
    id: 'page-home',
    title: 'Home',
    slug: 'index',
    rootNodeId: 'root-home',
    nodes: {
      'root-home': makeNode({
        id: 'root-home',
        moduleId: 'base.body',
        children: ['section-node'],
      }),
      'section-node': makeNode({
        id: 'section-node',
        moduleId: 'base.container',
        label: 'Hero section',
        children: ['headline-node'],
      }),
      'headline-node': makeNode({
        id: 'headline-node',
        moduleId: 'base.text',
        label: 'Hero headline',
        children: ['accent-node'],
      }),
      'accent-node': makeNode({
        id: 'accent-node',
        moduleId: 'base.text',
        label: 'Accent text',
      }),
    },
  })

  useEditorStore.setState({
    site: makeSite({ pages: [home], files: [], visualComponents: [] }),
    activePageId: 'page-home',
    activeDocument: null,
    activeBreakpointId: 'desktop',
    selectedNodeId: 'headline-node',
    selectedNodeIds: ['headline-node'],
    selectedSelectorClassId: null,
    selectedSelectorClassIds: [],
    activeClassId: null,
    hoveredNodeId: null,
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 360 },
    propertiesPanelMode: 'docked',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(() => resetStore())

describe('Properties panel layer ladder', () => {
  it('opens from the leading layer icon and selects parent or child layers', () => {
    render(<PropertiesPanel variant="docked" />)

    fireEvent.click(screen.getByRole('button', { name: /select parent or child layer for hero headline/i }))

    const menu = screen.getByRole('menu', { name: /select parent or child layer/i })
    expect(within(menu).getByRole('menuitem', { name: /hero section parent/i })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /hero headline current/i })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /accent text first child/i })).toBeTruthy()

    fireEvent.click(within(menu).getByRole('menuitem', { name: /hero section parent/i }))

    expect(useEditorStore.getState().selectedNodeId).toBe('section-node')
    expect(screen.getByTestId('properties-panel')).toBeTruthy()
  })
})
