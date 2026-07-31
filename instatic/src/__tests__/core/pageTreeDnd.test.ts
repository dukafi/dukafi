import { describe, expect, it } from 'bun:test'
import type { Page, PageNode } from '@core/page-tree'
import { resolvePageTreeDropTarget, reindexNodeParents } from '@core/page-tree'

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

const canHaveChildren = (moduleId: string) =>
  ['base.body', 'base.container', 'base.visual-component-ref', 'base.slot-instance'].includes(moduleId)

describe('resolvePageTreeDropTarget', () => {
  it('normalizes same-parent before and after targets around source removal', () => {
    const tree = page({
      root: node('root', 'base.body', ['a', 'b', 'c', 'd']),
      a: node('a', 'base.text'),
      b: node('b', 'base.text'),
      c: node('c', 'base.text'),
      d: node('d', 'base.text'),
    })

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'a',
      overId: 'd',
      zone: 'after',
      canHaveChildren,
    })?.index).toBe(3)

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'd',
      overId: 'a',
      zone: 'before',
      canHaveChildren,
    })?.index).toBe(0)
  })

  it('rejects illegal multi-drag targets for every dragged id', () => {
    const tree = page({
      root: node('root', 'base.body', ['container', 'target', 'locked']),
      container: node('container', 'base.container', ['child']),
      child: node('child', 'base.text'),
      target: node('target', 'base.container'),
      locked: node('locked', 'base.text', [], true),
    })

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'container',
      draggedIds: ['container', 'locked'],
      overId: 'target',
      zone: 'inside',
      canHaveChildren,
    })).toBeNull()

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'container',
      draggedIds: ['container', 'target'],
      overId: 'child',
      zone: 'inside',
      canHaveChildren,
    })).toBeNull()
  })

  it('allows user content inside slot instances while rejecting direct visual-component-ref children', () => {
    const tree = page({
      root: node('root', 'base.body', ['vcRef', 'outsideText']),
      vcRef: node('vcRef', 'base.visual-component-ref', ['slot']),
      slot: node('slot', 'base.slot-instance', [], true),
      outsideText: node('outsideText', 'base.text'),
    })

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'outsideText',
      overId: 'slot',
      zone: 'inside',
      canHaveChildren,
    })?.parentId).toBe('slot')

    expect(resolvePageTreeDropTarget({
      tree,
      draggedId: 'outsideText',
      overId: 'vcRef',
      zone: 'inside',
      canHaveChildren,
    })).toBeNull()
  })
})
