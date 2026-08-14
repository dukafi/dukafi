import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { useEditorStore } from '@site/store/store'
import { CanvasRoot } from '@site/canvas/CanvasRoot'
import { queryCanvasElement } from './iframeCanvasQuery'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base'

const originalFetch = globalThis.fetch

function renderCanvas() {
  return render(<DndContext><CanvasRoot /></DndContext>)
}

function setupImagePage(selectedNodeIds: string[] = []) {
  const root = makeNode({ id: 'root', moduleId: 'base.body', children: ['image'] })
  const image = makeNode({
    id: 'image',
    moduleId: 'base.image',
    props: { src: '', loading: 'lazy' },
  })
  const page = makePage({
    id: 'page-1',
    rootNodeId: 'root',
    nodes: { root, image },
  })

  useEditorStore.setState({
    site: makeSite({ pages: [page] }),
    activePageId: 'page-1',
    activeDocument: null,
    activeBreakpointId: 'desktop',
    selectedNodeId: selectedNodeIds[0] ?? null,
    selectedNodeIds,
    hoveredNodeId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(() => {
  cleanup()
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ value: null }), { status: 200 })) as typeof fetch
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe('NodeRenderer editor attributes', () => {
  it('keeps canvas selection attributes out of author-visible ARIA selectors', async () => {
    setupImagePage(['image'])
    renderCanvas()

    const imageEl = await waitForCanvasImage()
    expect(imageEl.getAttribute('data-node-id')).toBe('image')
    expect(imageEl.getAttribute('data-canvas-selected')).toBe('true')
    expect(imageEl.hasAttribute('role')).toBe(false)
    expect(imageEl.hasAttribute('aria-pressed')).toBe(false)
  })

  it('still selects an empty image placeholder from the canvas', async () => {
    setupImagePage()
    renderCanvas()

    const imageEl = await waitForCanvasImage()
    fireEvent.click(imageEl)

    expect(useEditorStore.getState().selectedNodeId).toBe('image')
  })
})

async function waitForCanvasImage(): Promise<HTMLElement> {
  for (let i = 0; i < 20; i += 1) {
    const imageEl = queryCanvasElement<HTMLElement>('[data-canvas-module-placeholder][data-node-id="image"]')
    if (imageEl) return imageEl
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw new Error('Expected image node in canvas iframe')
}
