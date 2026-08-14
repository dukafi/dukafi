/**
 * visualComponentRefInlineBody.test.tsx
 *
 * Regression coverage for component refs whose VC tree root is `base.body`.
 * Converted components use that shape, but inline page preview must not let a
 * nested component body overwrite the real canvas iframe `<body>` attributes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { useEditorStore } from '@site/store/store'
import { CanvasRoot } from '@site/canvas/CanvasRoot'
import { queryCanvasElement } from './iframeCanvasQuery'
import { makeNode, makePage, makeSite, makeVC, makeVCNode, makeVCTree } from '../fixtures'
import '@modules/base'

beforeEach(() => {
  cleanup()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    activeBreakpointId: 'mobile',
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    hoveredBreakpointId: null,
    propertiesPanel: { collapsed: true, x: 0, y: 0, width: 360 },
    packageJson: {},
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
})

afterEach(cleanup)

describe('base.visual-component-ref inline base.body root', () => {
  it('keeps the iframe body owned by the page root and puts ref metadata on rendered component content', async () => {
    const vc = makeVC({
      id: 'vc-card',
      name: 'Card',
      tree: makeVCTree('vc-root', [
        makeVCNode({
          id: 'vc-root',
          moduleId: 'base.body',
          children: ['vc-section'],
        }),
        makeVCNode({
          id: 'vc-section',
          moduleId: 'base.container',
          props: { tag: 'section', customTag: '' },
          children: ['vc-text'],
        }),
        makeVCNode({
          id: 'vc-text',
          moduleId: 'base.text',
          props: { text: 'Component text', tag: 'p' },
        }),
      ]),
    })
    const page = makePage({
      id: 'p1',
      rootNodeId: 'root',
      nodes: {
        root: makeNode({ id: 'root', moduleId: 'base.body', children: ['ref-card'] }),
        'ref-card': makeNode({
          id: 'ref-card',
          moduleId: 'base.visual-component-ref',
          props: { componentId: 'vc-card', propOverrides: {} },
        }),
      },
    })

    useEditorStore.setState({
      site: makeSite({ pages: [page], visualComponents: [vc] }),
      activePageId: 'p1',
      activeDocument: null,
    } as Parameters<typeof useEditorStore.setState>[0])

    render(<DndContext><CanvasRoot /></DndContext>)

    const componentRoot = await waitFor(() => {
      const el = queryCanvasElement<HTMLElement>('[data-node-id="ref-card"]')
      expect(el).toBeTruthy()
      expect(el!.tagName).toBe('SECTION')
      return el!
    })
    const iframeBody = componentRoot.ownerDocument.body

    await waitFor(() => {
      expect(iframeBody.getAttribute('data-node-id')).toBe('root')
      expect(iframeBody.getAttribute('data-module-id')).toBe('base.body')
    })
    expect(componentRoot.getAttribute('data-module-id')).toBe('base.visual-component-ref')
    expect(componentRoot.textContent).toContain('Component text')

    fireEvent.mouseEnter(componentRoot)

    await waitFor(() => {
      expect(useEditorStore.getState().hoveredNodeId).toBe('ref-card')
      expect(componentRoot.getAttribute('data-hovered')).toBe('true')
    })
  })
})
