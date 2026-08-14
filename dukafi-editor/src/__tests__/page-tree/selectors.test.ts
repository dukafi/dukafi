import { describe, it, expect } from 'bun:test'
import type { Page, PageNode } from '@core/page-tree'
import {
  getNode,
  getNodeOrThrow,
  getChildren,
  getParent,
  getAncestors,
  flattenSubtree,
  isAncestor,
  resolveProps,
  evaluateCondition,
  reindexNodeParents,
} from '@core/page-tree'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(id: string, children: string[] = [], props: Record<string, unknown> = {}): PageNode {
  return {
    id,
    moduleId: 'base.div',
    props,
    breakpointOverrides: {},
    children,
  }
}

function makePage(nodes: Record<string, PageNode>, rootNodeId = 'root'): Page {
  // Derive the parentId index — mirrors what parse/loadSite do for real trees.
  reindexNodeParents(nodes)
  return {
    id: 'page-1',
    slug: 'index',
    title: 'Home',
    nodes,
    rootNodeId,
  }
}

// Tree:  root → [a, b]  b → [c, d]  c → [e]
const TREE_PAGE = makePage({
  root: makeNode('root', ['a', 'b']),
  a:    makeNode('a'),
  b:    makeNode('b', ['c', 'd']),
  c:    makeNode('c', ['e']),
  d:    makeNode('d'),
  e:    makeNode('e'),
})

// ---------------------------------------------------------------------------
// getNode / getNodeOrThrow
// ---------------------------------------------------------------------------

describe('getNode', () => {
  it('returns node by id (O(1))', () => {
    expect(getNode(TREE_PAGE, 'e')?.id).toBe('e')
  })
  it('returns undefined for unknown id', () => {
    expect(getNode(TREE_PAGE, 'zzz')).toBeUndefined()
  })
})

describe('getNodeOrThrow', () => {
  it('returns node when found', () => {
    expect(getNodeOrThrow(TREE_PAGE, 'a').id).toBe('a')
  })
  it('throws when not found', () => {
    expect(() => getNodeOrThrow(TREE_PAGE, 'zzz')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// getChildren
// ---------------------------------------------------------------------------

describe('getChildren', () => {
  it('returns child nodes in order', () => {
    const children = getChildren(TREE_PAGE, 'b')
    expect(children.map((n) => n.id)).toEqual(['c', 'd'])
  })
  it('returns empty array for leaf node', () => {
    expect(getChildren(TREE_PAGE, 'e')).toEqual([])
  })
  it('returns empty array for unknown node', () => {
    expect(getChildren(TREE_PAGE, 'zzz')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getParent
// ---------------------------------------------------------------------------

describe('getParent', () => {
  it('returns parent of a node', () => {
    expect(getParent(TREE_PAGE, 'e')?.id).toBe('c')
    expect(getParent(TREE_PAGE, 'c')?.id).toBe('b')
  })
  it('returns undefined for root node', () => {
    expect(getParent(TREE_PAGE, 'root')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getAncestors
// ---------------------------------------------------------------------------

describe('getAncestors', () => {
  it('returns ordered ancestors from root to parent', () => {
    const ancestors = getAncestors(TREE_PAGE, 'e').map((n) => n.id)
    expect(ancestors).toEqual(['root', 'b', 'c'])
  })
  it('returns empty array for root', () => {
    expect(getAncestors(TREE_PAGE, 'root')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// flattenSubtree
// ---------------------------------------------------------------------------

describe('flattenSubtree', () => {
  it('flattens full tree in depth-first pre-order', () => {
    const ids = flattenSubtree(TREE_PAGE, 'root')
    // root → a, b → c → e, d
    expect(ids).toEqual(['root', 'a', 'b', 'c', 'e', 'd'])
  })
  it('flattens a leaf node to just itself', () => {
    expect(flattenSubtree(TREE_PAGE, 'e')).toEqual(['e'])
  })
  it('flattens a subtree correctly', () => {
    expect(flattenSubtree(TREE_PAGE, 'b')).toEqual(['b', 'c', 'e', 'd'])
  })
})

// ---------------------------------------------------------------------------
// isAncestor
// ---------------------------------------------------------------------------

describe('isAncestor', () => {
  it('returns true if first arg is ancestor of second', () => {
    expect(isAncestor(TREE_PAGE, 'root', 'e')).toBe(true)
    expect(isAncestor(TREE_PAGE, 'b', 'e')).toBe(true)
    expect(isAncestor(TREE_PAGE, 'c', 'e')).toBe(true)
  })
  it('returns false if not an ancestor', () => {
    expect(isAncestor(TREE_PAGE, 'a', 'e')).toBe(false)
    expect(isAncestor(TREE_PAGE, 'd', 'e')).toBe(false)
  })
  it('returns true for self', () => {
    expect(isAncestor(TREE_PAGE, 'e', 'e')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveProps
// ---------------------------------------------------------------------------

describe('resolveProps', () => {
  it('returns base props when no breakpointId', () => {
    const node = makeNode('n', [], { color: 'red', size: 16 })
    expect(resolveProps(node)).toEqual({ color: 'red', size: 16 })
  })
  it('merges breakpoint overrides when breakpointId is given', () => {
    const node: PageNode = {
      ...makeNode('n', [], { color: 'red', size: 16 }),
      breakpointOverrides: { mobile: { size: 12 } },
    }
    expect(resolveProps(node, 'mobile')).toEqual({ color: 'red', size: 12 })
  })
  it('returns base props when breakpointId has no overrides', () => {
    const node = makeNode('n', [], { color: 'red' })
    expect(resolveProps(node, 'tablet')).toEqual({ color: 'red' })
  })
})

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  const props = { type: 'link', visible: true, count: 3 }

  it('evaluates eq', () => {
    expect(evaluateCondition({ field: 'type', eq: 'link' }, props)).toBe(true)
    expect(evaluateCondition({ field: 'type', eq: 'button' }, props)).toBe(false)
  })

  it('evaluates notEq', () => {
    expect(evaluateCondition({ field: 'type', notEq: 'button' }, props)).toBe(true)
    expect(evaluateCondition({ field: 'type', notEq: 'link' }, props)).toBe(false)
  })

  it('evaluates in', () => {
    expect(evaluateCondition({ field: 'type', in: ['link', 'button'] }, props)).toBe(true)
    expect(evaluateCondition({ field: 'type', in: ['image'] }, props)).toBe(false)
  })

  it('evaluates notIn', () => {
    expect(evaluateCondition({ field: 'type', notIn: ['image'] }, props)).toBe(true)
    expect(evaluateCondition({ field: 'type', notIn: ['link'] }, props)).toBe(false)
  })

  it('evaluates and (all must be true)', () => {
    expect(evaluateCondition({
      and: [{ field: 'type', eq: 'link' }, { field: 'visible', eq: true }]
    }, props)).toBe(true)
    expect(evaluateCondition({
      and: [{ field: 'type', eq: 'link' }, { field: 'visible', eq: false }]
    }, props)).toBe(false)
  })

  it('evaluates or (at least one must be true)', () => {
    expect(evaluateCondition({
      or: [{ field: 'type', eq: 'image' }, { field: 'visible', eq: true }]
    }, props)).toBe(true)
    expect(evaluateCondition({
      or: [{ field: 'type', eq: 'image' }, { field: 'visible', eq: false }]
    }, props)).toBe(false)
  })
})
