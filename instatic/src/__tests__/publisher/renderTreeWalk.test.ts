import { describe, test, expect } from 'bun:test'
import type { BaseNode, SiteDocument } from '@core/page-tree'
import { walkRenderTree } from '../../../server/publish/renderTreeWalk'

/**
 * ISS-022: loop/media prefetch must descend into Visual Component definition
 * trees, otherwise a base.loop or image inside a VC body is never fetched and
 * renders with no data. The shared walker visits every node that actually
 * renders — page nodes AND nodes inside referenced VC trees — with a cycle
 * guard so a self-referencing VC can't loop forever.
 */
const n = (id: string, moduleId: string, children: string[] = [], props: Record<string, unknown> = {}): BaseNode =>
  ({ id, moduleId, props, children, breakpointOverrides: {}, classIds: [] }) as unknown as BaseNode

function siteWith(vcs: Array<{ id: string; rootNodeId: string; nodes: Record<string, BaseNode> }>): SiteDocument {
  return {
    visualComponents: vcs.map((vc) => ({
      id: vc.id,
      name: vc.id,
      params: [],
      tree: { rootNodeId: vc.rootNodeId, nodes: vc.nodes },
    })),
  } as unknown as SiteDocument
}

describe('walkRenderTree', () => {
  test('descends into a referenced VC definition tree', () => {
    const site = siteWith([
      {
        id: 'vc1',
        rootNodeId: 'v1',
        nodes: {
          v1: n('v1', 'base.container', ['v1loop', 'v1img']),
          v1loop: n('v1loop', 'base.loop'),
          v1img: n('v1img', 'base.image', [], { src: '/uploads/x.png' }),
        },
      },
    ])
    const pageNodes: Record<string, BaseNode> = {
      root: n('root', 'base.body', ['ref']),
      ref: n('ref', 'base.visual-component-ref', [], { componentId: 'vc1' }),
    }
    const visited: string[] = []
    walkRenderTree(pageNodes, 'root', site, (node) => visited.push(node.id))
    expect(visited).toContain('v1loop')
    expect(visited).toContain('v1img')
  })

  test('terminates on a self-referencing VC cycle', () => {
    const site = siteWith([
      { id: 'vcA', rootNodeId: 'a', nodes: { a: n('a', 'base.visual-component-ref', [], { componentId: 'vcB' }) } },
      { id: 'vcB', rootNodeId: 'b', nodes: { b: n('b', 'base.visual-component-ref', [], { componentId: 'vcA' }) } },
    ])
    const pageNodes: Record<string, BaseNode> = {
      root: n('root', 'base.visual-component-ref', [], { componentId: 'vcA' }),
    }
    const visited: string[] = []
    walkRenderTree(pageNodes, 'root', site, (node) => visited.push(node.id))
    // Both VC bodies are visited exactly once; no infinite recursion.
    expect(visited.filter((id) => id === 'a')).toHaveLength(1)
    expect(visited.filter((id) => id === 'b')).toHaveLength(1)
  })
})
