import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CanvasLayerContextMenu } from '@site/canvas/CanvasLayerContextMenu'
import { PropertiesPanel } from '@site/panels/PropertiesPanel/PropertiesPanel'
import { useEditorStore } from '@site/store/store'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

afterEach(cleanup)

const noop = () => {}

function resetStore() {
  localStorage.clear()
  const home = makePage({
    id: 'page-home',
    title: 'Home',
    slug: 'index',
    rootNodeId: 'root-home',
    nodes: {
      'root-home': makeNode({ id: 'root-home', moduleId: 'base.body', children: ['container-node'] }),
      'container-node': makeNode({ id: 'container-node', moduleId: 'base.container' }),
    },
  })
  useEditorStore.setState({
    site: makeSite({ pages: [home], files: [], visualComponents: [] }),
    activePageId: 'page-home',
    activeDocument: null,
    selectedNodeId: 'container-node',
    selectedNodeIds: ['container-node'],
    hoveredNodeId: null,
    propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
    propertiesPanelMode: 'docked',
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

function CanvasContextMenuHarness() {
  const [open, setOpen] = useState(true)
  return (
    <div
      data-testid="canvas-click-target"
      onClick={() => useEditorStore.getState().clearSelection()}
    >
      {open && (
        <CanvasLayerContextMenu
          position={{ x: 100, y: 200, nodeId: 'container-node' }}
          onClose={() => setOpen(false)}
          actions={{
            requestDeleteNode: noop,
            duplicateNode: noop,
            openRenameDialog: noop,
            wrapNode: noop,
            copyNode: noop,
            cutNode: noop,
            pasteNode: noop,
          }}
        />
      )}
      <PropertiesPanel variant="docked" />
    </div>
  )
}

beforeEach(() => resetStore())

describe('CanvasLayerContextMenu', () => {
  it('keeps the componentize editor open when a canvas menu item is clicked', async () => {
    render(<CanvasContextMenuHarness />)

    fireEvent.click(screen.getByRole('menuitem', { name: /componentize/i }))

    expect(useEditorStore.getState().selectedNodeId).toBe('container-node')
    expect(useEditorStore.getState().propertiesPanel.collapsed).toBe(false)
    const input = await screen.findByRole('textbox', { name: /component name/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
  })
})
