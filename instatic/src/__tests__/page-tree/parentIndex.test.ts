/**
 * parentId invariant — the behaviour-critical contract for the O(1) getParent
 * pointer (docs/reference/page-tree.md → "parentId invariant").
 *
 * Coverage:
 *   1. Invariant after EACH mutation (insert/delete/move/moveNodes/duplicate/
 *      wrap/wrapNodes/paste): every non-root node's parentId points to a node
 *      whose children include it; root.parentId === null; no dangling pointers.
 *   2. Invariant survives editor-store undo/redo, including a randomized fuzz
 *      sequence of mutations interleaved with undo/redo.
 *   3. Correctness parity: getParent/getAncestors/isAncestor return identical
 *      results to a reference O(N) children-scan implementation.
 *   4. reindexNodeParents derives the index purely from children arrays and
 *      never trusts a stored parentId value.
 *   5. Perf sanity: getParent reads a constant number of node-map entries,
 *      independent of sibling count (it does NOT scan Object.values).
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import type { NodeTree, PageNode, BaseNode } from '@core/page-tree'
import {
  createNode,
  insertNode,
  deleteNode,
  moveNode,
  moveNodes,
  duplicateNode,
  wrapNode,
  wrapNodes,
  pasteSubtree,
  buildSubtreeNodeIdMap,
  getParent,
  getAncestors,
  isAncestor,
  reindexNodeParents,
} from '@core/page-tree'
import { useEditorStore } from '@site/store/store'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

// ---------------------------------------------------------------------------
// Invariant checker
// ---------------------------------------------------------------------------

/**
 * Walk the whole tree and assert the parentId index is fully consistent:
 *   - root.parentId is null
 *   - every parent→child edge is mirrored by child.parentId === parent.id
 *   - every non-root node has a string parentId pointing at a node that
 *     actually lists it as a child (no half-population, no dangling pointer)
 */
function assertParentInvariant(tree: NodeTree<BaseNode>): void {
  const root = tree.nodes[tree.rootNodeId]
  expect(root).toBeDefined()
  expect(root.parentId ?? null).toBeNull()

  // Edge consistency: each child points back at its lister.
  for (const [id, node] of Object.entries(tree.nodes)) {
    for (const childId of node.children) {
      const child = tree.nodes[childId]
      expect(child).toBeDefined()
      expect(child.parentId).toBe(id)
    }
  }

  // No half-population / no dangling: every non-root node has a parent that
  // lists it.
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (id === tree.rootNodeId) continue
    expect(typeof node.parentId).toBe('string')
    const parent = tree.nodes[node.parentId as string]
    expect(parent).toBeDefined()
    expect(parent.children).toContain(id)
  }
}

// ---------------------------------------------------------------------------
// Tree builder — goes through createNode/insertNode so parentId is maintained.
// ---------------------------------------------------------------------------

/** Build `root → [a, b]`, `b → [c, d]`, `c → [e]` via the real mutations. */
function buildTree(): NodeTree<PageNode> {
  const root = createNode('base.body')
  const tree: NodeTree<PageNode> = { nodes: { [root.id]: root }, rootNodeId: root.id }
  const mk = (id: string) => {
    const n = createNode('base.container')
    n.id = id
    return n
  }
  insertNode(tree, mk('a'), root.id)
  insertNode(tree, mk('b'), root.id)
  insertNode(tree, mk('c'), 'b')
  insertNode(tree, mk('d'), 'b')
  insertNode(tree, mk('e'), 'c')
  return tree
}

// ---------------------------------------------------------------------------
// 1. Invariant after each mutation
// ---------------------------------------------------------------------------

describe('parentId invariant — per mutation', () => {
  it('holds after insertNode (and after the build itself)', () => {
    const tree = buildTree()
    assertParentInvariant(tree)
    expect(getParent(tree, 'e')?.id).toBe('c')
    expect(getParent(tree, tree.rootNodeId)).toBeUndefined()
  })

  it('holds after deleteNode (cascades, no dangling survivors)', () => {
    const tree = buildTree()
    deleteNode(tree, 'b') // removes b, c, d, e
    assertParentInvariant(tree)
    expect(tree.nodes['c']).toBeUndefined()
    expect(getParent(tree, 'a')?.id).toBe(tree.rootNodeId)
  })

  it('holds after moveNode to a new parent', () => {
    const tree = buildTree()
    moveNode(tree, 'e', 'a', 0) // e: c → a
    assertParentInvariant(tree)
    expect(getParent(tree, 'e')?.id).toBe('a')
  })

  it('holds after moveNode reorder within same parent', () => {
    const tree = buildTree()
    moveNode(tree, 'd', 'b', 0)
    assertParentInvariant(tree)
    expect(getParent(tree, 'd')?.id).toBe('b')
  })

  it('holds after moveNodes (multi-select)', () => {
    const tree = buildTree()
    moveNodes(tree, ['c', 'd'], 'a', 0) // both into a
    assertParentInvariant(tree)
    expect(getParent(tree, 'c')?.id).toBe('a')
    expect(getParent(tree, 'd')?.id).toBe('a')
  })

  it('holds after duplicateNode (clone subtree)', () => {
    const tree = buildTree()
    const cloneId = duplicateNode(tree, 'b')
    assertParentInvariant(tree)
    // The clone's root is a sibling of b under root; its cloned children point
    // at the clone, not the original.
    expect(getParent(tree, cloneId)?.id).toBe(tree.rootNodeId)
    const cloneChildren = tree.nodes[cloneId].children
    for (const childId of cloneChildren) {
      expect(tree.nodes[childId].parentId).toBe(cloneId)
    }
  })

  it('holds after wrapNode', () => {
    const tree = buildTree()
    const wrapperId = wrapNode(tree, 'e', 'base.container')
    assertParentInvariant(tree)
    expect(getParent(tree, 'e')?.id).toBe(wrapperId)
    expect(getParent(tree, wrapperId)?.id).toBe('c')
  })

  it('holds after wrapNodes (multi-select)', () => {
    const tree = buildTree()
    const wrapperId = wrapNodes(tree, ['a', 'b'], 'base.container')
    assertParentInvariant(tree)
    expect(getParent(tree, wrapperId)?.id).toBe(tree.rootNodeId)
    expect(getParent(tree, 'a')?.id).toBe(wrapperId)
    expect(getParent(tree, 'b')?.id).toBe(wrapperId)
  })

  it('holds after pasteSubtree (foreign payload)', () => {
    const tree = buildTree()
    // Build a foreign payload tree: x → [y]
    const x = createNode('base.container'); x.id = 'x'
    const y = createNode('base.container'); y.id = 'y'
    x.children = ['y']
    const payload = { rootNodeId: 'x', nodes: { x, y } }
    const idMap = buildSubtreeNodeIdMap('x', payload.nodes)
    const newRootId = pasteSubtree(tree, payload, 'a', undefined, { nodeIdMap: idMap })
    assertParentInvariant(tree)
    expect(getParent(tree, newRootId)?.id).toBe('a')
    const pastedChild = tree.nodes[newRootId].children[0]
    expect(tree.nodes[pastedChild].parentId).toBe(newRootId)
  })
})

// ---------------------------------------------------------------------------
// 2. reindexNodeParents correctness
// ---------------------------------------------------------------------------

describe('reindexNodeParents', () => {
  it('derives parentId purely from children, ignoring any stored value', () => {
    const nodes: Record<string, BaseNode> = {
      root: { id: 'root', moduleId: 'base.body', props: {}, breakpointOverrides: {}, children: ['a'], classIds: [], parentId: 'BOGUS' },
      a: { id: 'a', moduleId: 'base.container', props: {}, breakpointOverrides: {}, children: ['b'], classIds: [], parentId: 'ALSO-BOGUS' },
      b: { id: 'b', moduleId: 'base.text', props: {}, breakpointOverrides: {}, children: [], classIds: [], parentId: 'root' /* stale */ },
    }
    reindexNodeParents(nodes)
    expect(nodes.root.parentId).toBeNull()
    expect(nodes.a.parentId).toBe('root')
    expect(nodes.b.parentId).toBe('a')
  })

  it('sets parentId to null for orphan nodes not listed by anyone', () => {
    const nodes: Record<string, BaseNode> = {
      root: { id: 'root', moduleId: 'base.body', props: {}, breakpointOverrides: {}, children: [], classIds: [] },
      orphan: { id: 'orphan', moduleId: 'base.text', props: {}, breakpointOverrides: {}, children: [], classIds: [], parentId: 'root' },
    }
    reindexNodeParents(nodes)
    expect(nodes.orphan.parentId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Correctness parity vs a reference O(N) implementation
// ---------------------------------------------------------------------------

function refParent(tree: NodeTree<BaseNode>, id: string): BaseNode | undefined {
  for (const n of Object.values(tree.nodes)) {
    if (n.children.includes(id)) return n
  }
  return undefined
}

function refAncestors(tree: NodeTree<BaseNode>, id: string): BaseNode[] {
  const out: BaseNode[] = []
  let cur = id
  const seen = new Set<string>()
  while (!seen.has(cur)) {
    seen.add(cur)
    const p = refParent(tree, cur)
    if (!p) break
    out.unshift(p)
    cur = p.id
  }
  return out
}

function refIsAncestor(tree: NodeTree<BaseNode>, ancestorId: string, id: string): boolean {
  if (ancestorId === id) return true
  let cur = id
  const seen = new Set<string>()
  while (!seen.has(cur)) {
    seen.add(cur)
    const p = refParent(tree, cur)
    if (!p) return false
    if (p.id === ancestorId) return true
    cur = p.id
  }
  return false
}

describe('selector parity — pointer impl matches O(N) reference', () => {
  it('getParent / getAncestors / isAncestor agree for every node', () => {
    const tree = buildTree()
    const ids = Object.keys(tree.nodes)
    for (const id of ids) {
      expect(getParent(tree, id)?.id).toBe(refParent(tree, id)?.id)
      expect(getAncestors(tree, id).map((n) => n.id)).toEqual(refAncestors(tree, id).map((n) => n.id))
      for (const other of ids) {
        expect(isAncestor(tree, id, other)).toBe(refIsAncestor(tree, id, other))
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Perf sanity — getParent is O(1), not an Object.values scan
// ---------------------------------------------------------------------------

describe('getParent perf sanity', () => {
  function buildWideTree(siblingCount: number): NodeTree<PageNode> {
    const root = createNode('base.body')
    const tree: NodeTree<PageNode> = { nodes: { [root.id]: root }, rootNodeId: root.id }
    for (let i = 0; i < siblingCount; i++) {
      const child = createNode('base.container')
      child.id = `c${i}`
      insertNode(tree, child, root.id)
    }
    return tree
  }

  /** Count property reads on the nodes map during one getParent call. */
  function countNodeReads(tree: NodeTree<PageNode>, nodeId: string): number {
    let reads = 0
    const counting = new Proxy(tree.nodes, {
      get(target, key: string) {
        reads++
        return target[key]
      },
      // Object.values / for..in would trip ownKeys — make that observable too.
      ownKeys(target) {
        reads += Object.keys(target).length
        return Reflect.ownKeys(target)
      },
    })
    const proxiedTree: NodeTree<PageNode> = { nodes: counting as Record<string, PageNode>, rootNodeId: tree.rootNodeId }
    getParent(proxiedTree, nodeId)
    return reads
  }

  it('reads a constant number of node-map entries regardless of sibling count', () => {
    const small = buildWideTree(8)
    const large = buildWideTree(8000)
    const smallReads = countNodeReads(small, 'c5')
    const largeReads = countNodeReads(large, 'c5')
    expect(smallReads).toBe(largeReads) // independent of N → no scan
    expect(smallReads).toBeLessThanOrEqual(4) // O(1): a couple of pointer hops
  })
})

// ---------------------------------------------------------------------------
// 5. Editor store — invariant survives undo / redo + randomized fuzz
// ---------------------------------------------------------------------------

function activeTree(): NodeTree<BaseNode> {
  const s = useEditorStore.getState()
  const page = s.site!.pages.find((p) => p.id === s.activePageId)!
  return page as unknown as NodeTree<BaseNode>
}

function loadFixtureSite(): string {
  const root = makeNode({ id: 'root', moduleId: 'base.body', children: ['box'] })
  const box = makeNode({ id: 'box', moduleId: 'base.container', children: ['t1', 't2'] })
  const t1 = makeNode({ id: 't1', moduleId: 'base.text' })
  const t2 = makeNode({ id: 't2', moduleId: 'base.text' })
  const page = makePage({
    id: 'p1', slug: 'index', title: 'Home', rootNodeId: 'root',
    nodes: { root, box, t1, t2 },
  })
  useEditorStore.getState().loadSite(makeSite({ pages: [page], visualComponents: [] }))
  return 'box'
}

describe('parentId invariant — editor store undo/redo', () => {
  beforeEach(() => {
    loadFixtureSite()
  })

  it('holds across a mutation and its undo + redo', () => {
    const store = useEditorStore.getState()
    assertParentInvariant(activeTree())

    store.duplicateNode('box')
    assertParentInvariant(activeTree())

    store.undo()
    assertParentInvariant(activeTree())

    store.redo()
    assertParentInvariant(activeTree())
  })

  it('stays consistent through a randomized mutation + undo/redo sequence', () => {
    const store = () => useEditorStore.getState()
    // Deterministic LCG so the fuzz is reproducible without Math.random.
    let seed = 0x9e3779b1
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
    /** Pick up to `n` distinct elements (for multi-select ops). */
    const pickMany = <T,>(arr: T[], n: number): T[] => {
      const pool = [...arr]
      const out: T[] = []
      while (pool.length && out.length < n) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
      return out
    }

    for (let step = 0; step < 160; step++) {
      const tree = activeTree()
      const movable = Object.keys(tree.nodes).filter((id) => id !== tree.rootNodeId)
      const containers = Object.values(tree.nodes)
        .filter((n) => n.moduleId === 'base.body' || n.moduleId === 'base.container')
        .map((n) => n.id)
      const op = Math.floor(rand() * 10)
      try {
        if (op === 0 && containers.length) {
          store().insertNode('base.text', {}, pick(containers))
        } else if (op === 1 && containers.length) {
          store().insertNode('base.container', {}, pick(containers))
        } else if (op === 2 && movable.length) {
          store().duplicateNode(pick(movable))
        } else if (op === 3 && movable.length && containers.length) {
          store().wrapNode(pick(movable), 'base.container')
        } else if (op === 4 && movable.length) {
          store().deleteNode(pick(movable))
        } else if (op === 5 && movable.length && containers.length) {
          // moveNode — the drag hot path this whole refactor targets. The cycle
          // guard throws when the target is a descendant; caught below.
          store().moveNode(pick(movable), pick(containers), Math.floor(rand() * 3))
        } else if (op === 6 && movable.length && containers.length) {
          store().moveNodes(pickMany(movable, 2), pick(containers), Math.floor(rand() * 3))
        } else if (op === 7 && movable.length) {
          store().wrapNodes(pickMany(movable, 2), 'base.container')
        } else if (op === 8 && movable.length && containers.length) {
          // copy a subtree, then paste it under a container (exercises pasteSubtree).
          if (store().copyNode(pick(movable))) store().pasteNode(pick(containers))
        } else if (op === 9) {
          // Bias toward exercising history.
          if (rand() < 0.5 && store().canUndo) store().undo()
          else if (store().canRedo) store().redo()
        }
      } catch {
        // Some random ops are illegal (e.g. wrapping the root, moving a node
        // into its own descendant) and throw or no-op — that's fine; the
        // invariant must still hold afterwards.
      }
      assertParentInvariant(activeTree())
    }
  })
})
