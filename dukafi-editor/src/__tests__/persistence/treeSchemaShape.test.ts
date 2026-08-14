/**
 * treeSchemaShape.test.ts — gate the shape of `NodeTreeSchema`.
 *
 * Part of the Tree Unification Refactor (docs/superpowers/plans/2026-05-06-tree-unification.md).
 *
 * `NodeTree` is the single primitive that every tree of nodes in this codebase
 * uses going forward — Pages, Visual Components, and (via materialization)
 * slot fills inside VC refs all share the same shape.
 *
 * Goals of this test file:
 *   1. The schema lives at `src/core/page-tree/treeSchema.ts` and exports
 *      `NodeTreeSchema` and a derived `NodeTree` TypeScript type.
 *   2. The shape is exactly `{ nodes: Record<string, BaseNode>, rootNodeId: string }`.
 *   3. A minimal valid tree validates cleanly.
 *   4. Missing `rootNodeId`, missing `nodes`, and non-string `rootNodeId` all fail.
 *   5. The `NodeTree<T>` type accepts a node-type parameter that constrains
 *      `nodes` to that subtype.
 */

import { describe, it, expect } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import { NodeTreeSchema, type NodeTree } from '@core/page-tree'
import type { BaseNode } from '@core/page-tree'

function baseNode(id: string, moduleId: string, children: string[] = []): BaseNode {
  return {
    id,
    moduleId,
    props: {},
    breakpointOverrides: {},
    children,
    classIds: [],
  }
}

describe('NodeTreeSchema — shape gate', () => {
  it('validates a minimal tree with one root node', () => {
    const tree: NodeTree = {
      nodes: { root: baseNode('root', 'base.body') },
      rootNodeId: 'root',
    }
    expect(Value.Check(NodeTreeSchema, tree)).toBe(true)
  })

  it('validates a tree with nested children referenced by id only', () => {
    const tree: NodeTree = {
      nodes: {
        root: baseNode('root', 'base.body', ['c1', 'c2']),
        c1: baseNode('c1', 'base.text'),
        c2: baseNode('c2', 'base.container', ['c3']),
        c3: baseNode('c3', 'base.text'),
      },
      rootNodeId: 'root',
    }
    expect(Value.Check(NodeTreeSchema, tree)).toBe(true)
  })

  it('rejects an object missing rootNodeId', () => {
    const bad = {
      nodes: { root: baseNode('root', 'base.body') },
    }
    expect(Value.Check(NodeTreeSchema, bad)).toBe(false)
  })

  it('rejects an object missing nodes', () => {
    const bad = { rootNodeId: 'root' }
    expect(Value.Check(NodeTreeSchema, bad)).toBe(false)
  })

  it('rejects a tree where rootNodeId is not a string', () => {
    const bad = {
      nodes: { root: baseNode('root', 'base.body') },
      rootNodeId: 42,
    }
    expect(Value.Check(NodeTreeSchema, bad)).toBe(false)
  })
})

describe('NodeTree<T> — generic type parameter', () => {
  it('compiles when used with a richer node type (PageNode-shape)', () => {
    interface PageNodeLike extends BaseNode {
      dynamicBindings?: Record<string, unknown>
    }
    const tree: NodeTree<PageNodeLike> = {
      nodes: {
        root: { ...baseNode('root', 'base.body'), dynamicBindings: { x: { source: 'currentEntry' } } },
      },
      rootNodeId: 'root',
    }
    // Type-only test: this passing the compiler is the assertion. At runtime
    // we just confirm the constructed object is well-formed.
    expect(tree.rootNodeId).toBe('root')
    expect(tree.nodes.root.dynamicBindings?.x).toBeDefined()
  })
})

describe('Page IS a NodeTree (shape gate)', () => {
  it('a structurally-valid Page passes NodeTreeSchema validation', async () => {
    // Loaded inside the test to avoid a top-level import cycle hazard.
    const { PageSchema } = await import('@core/page-tree')
    const samplePage = {
      id: 'p1',
      slug: 'home',
      title: 'Home',
      nodes: {
        body: baseNode('body', 'base.body', ['c1']),
        c1: baseNode('c1', 'base.text'),
      },
      rootNodeId: 'body',
    }
    expect(Value.Check(PageSchema, samplePage)).toBe(true)
    // The same object must satisfy NodeTreeSchema — Page IS a NodeTree.
    expect(Value.Check(NodeTreeSchema, samplePage)).toBe(true)
  })

  it('a Page missing rootNodeId fails NodeTreeSchema (and PageSchema)', async () => {
    const { PageSchema } = await import('@core/page-tree')
    const bad = {
      id: 'p1',
      slug: 'home',
      title: 'Home',
      nodes: { body: baseNode('body', 'base.body') },
    }
    expect(Value.Check(NodeTreeSchema, bad)).toBe(false)
    expect(Value.Check(PageSchema, bad)).toBe(false)
  })
})
