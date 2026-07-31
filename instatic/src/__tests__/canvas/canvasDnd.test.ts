import { describe, expect, it } from 'bun:test'
import type { Page, PageNode } from '@core/page-tree'
import { reindexNodeParents } from '@core/page-tree'
import {
  getCanvasDropZone,
  resolveCanvasInsertionTarget,
  resolveCanvasDropTarget,
  type CanvasDropCandidate,
} from '@admin/pages/site/canvas/canvasDnd'

function node(id: string, moduleId: string, children: string[] = [], locked = false): PageNode {
  return {
    id,
    moduleId,
    props: {},
    breakpointOverrides: {},
    children,
    locked,
  }
}

function page(nodes: Record<string, PageNode>, rootNodeId = 'root'): Page {
  reindexNodeParents(nodes)
  return {
    id: 'page',
    slug: 'index',
    title: 'Home',
    rootNodeId,
    nodes,
  }
}

function candidate(
  nodeId: string,
  depth: number,
  rect: { left: number; top: number; width: number; height: number },
  axis: 'vertical' | 'horizontal' = 'vertical',
): CanvasDropCandidate {
  return {
    nodeId,
    depth,
    axis,
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
    },
  }
}

const canHaveChildren = (moduleId: string) =>
  moduleId === 'base.body' || moduleId === 'base.container'

describe('canvasDnd', () => {
  it('maps vertical and horizontal pointer bands to before inside and after zones', () => {
    const vertical = candidate('a', 1, { left: 0, top: 0, width: 100, height: 100 })
    const horizontal = candidate('b', 1, { left: 0, top: 0, width: 100, height: 100 }, 'horizontal')

    expect(getCanvasDropZone(vertical, { x: 50, y: 4 })).toBe('before')
    expect(getCanvasDropZone(vertical, { x: 50, y: 50 })).toBe('inside')
    expect(getCanvasDropZone(vertical, { x: 50, y: 96 })).toBe('after')
    expect(getCanvasDropZone(horizontal, { x: 4, y: 50 })).toBe('before')
    expect(getCanvasDropZone(horizontal, { x: 50, y: 50 })).toBe('inside')
    expect(getCanvasDropZone(horizontal, { x: 96, y: 50 })).toBe('after')
  })

  it('uses the deepest candidate under the pointer when resolving a drop', () => {
    const tree = page({
      root: node('root', 'base.body', ['outer', 'dragged']),
      outer: node('outer', 'base.container', ['inner']),
      inner: node('inner', 'base.container'),
      dragged: node('dragged', 'base.text'),
    })

    const result = resolveCanvasDropTarget({
      tree,
      draggedId: 'dragged',
      draggedIds: ['dragged'],
      candidates: [
        candidate('outer', 1, { left: 0, top: 0, width: 300, height: 300 }),
        candidate('inner', 2, { left: 20, top: 20, width: 80, height: 80 }),
      ],
      point: { x: 50, y: 50 },
      canHaveChildren,
    })

    expect(result.target?.parentId).toBe('inner')
    expect(result.target?.position).toBe('inside')
    expect(result.invalid).toBeNull()
  })

  it('returns invalid preview metadata when the pointed node cannot accept the resolved zone', () => {
    const tree = page({
      root: node('root', 'base.body', ['dragged', 'leaf']),
      dragged: node('dragged', 'base.text'),
      leaf: node('leaf', 'base.text'),
    })
    const overLeaf = candidate('leaf', 1, { left: 0, top: 0, width: 120, height: 120 })

    const result = resolveCanvasDropTarget({
      tree,
      draggedId: 'dragged',
      draggedIds: ['dragged'],
      candidates: [overLeaf],
      point: { x: 60, y: 60 },
      canHaveChildren,
    })

    expect(result.target).toBeNull()
    expect(result.invalid).toEqual({
      overId: 'leaf',
      rect: overLeaf.rect,
      axis: 'vertical',
    })
  })

  it('resolves new module insertion into containers and after leaf nodes', () => {
    const tree = page({
      root: node('root', 'base.body', ['container', 'leaf']),
      container: node('container', 'base.container', ['child']),
      child: node('child', 'base.text'),
      leaf: node('leaf', 'base.text'),
    })

    const intoContainer = resolveCanvasInsertionTarget({
      tree,
      candidates: [
        candidate('container', 1, { left: 0, top: 0, width: 200, height: 120 }),
      ],
      point: { x: 100, y: 60 },
      canHaveChildren,
    })
    expect(intoContainer?.parentId).toBe('container')
    expect(intoContainer?.index).toBe(1)
    expect(intoContainer?.position).toBe('inside')

    const afterLeaf = resolveCanvasInsertionTarget({
      tree,
      candidates: [
        candidate('leaf', 1, { left: 0, top: 140, width: 200, height: 80 }),
      ],
      point: { x: 100, y: 180 },
      canHaveChildren,
    })
    expect(afterLeaf?.parentId).toBe('root')
    expect(afterLeaf?.index).toBe(2)
    expect(afterLeaf?.position).toBe('after')
  })
})
