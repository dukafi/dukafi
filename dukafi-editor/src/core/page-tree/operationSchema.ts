import {
  Type,
  formatValueErrors,
  type Static,
} from '@core/utils/typeboxHelpers'
import { compiledCheck, compiledDecode } from '@core/utils/typeboxCompiler'
import type { BaseNode } from './baseNode'
import { PageNodeSchema, type PageNode } from './pageNode'
import { NodeTreeSchema, type NodeTree } from './treeSchema'
import { reindexNodeParents } from './parentIndex'

export const TreeOperationSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('insertNode'),
    parentId: Type.String(),
    index: Type.Integer({ minimum: 0 }),
    node: PageNodeSchema,
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('updateNodeProps'),
    nodeId: Type.String(),
    props: Type.Record(Type.String(), Type.Unknown()),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('setBreakpointOverride'),
    nodeId: Type.String(),
    breakpoint: Type.String(),
    props: Type.Record(Type.String(), Type.Unknown()),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('clearBreakpointOverride'),
    nodeId: Type.String(),
    breakpoint: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('renameNode'),
    nodeId: Type.String(),
    name: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('toggleNodeLocked'),
    nodeId: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('toggleNodeHidden'),
    nodeId: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('moveNode'),
    nodeId: Type.String(),
    parentId: Type.String(),
    index: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('duplicateNode'),
    nodeId: Type.String(),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('wrapNode'),
    nodeId: Type.String(),
    wrapper: Type.Object({
      moduleId: Type.String(),
      defaults: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('deleteNode'),
    nodeId: Type.String(),
  }, { additionalProperties: false }),
])

export type TreeOperation = Static<typeof TreeOperationSchema>

export const TreeMutateResultSchema = Type.Object({
  tree: NodeTreeSchema,
  affectedNodeIds: Type.Array(Type.String()),
}, { additionalProperties: false })

export type TreeMutateResult = Static<typeof TreeMutateResultSchema>

export function assertValidNodeTree<TNode extends BaseNode>(
  tree: NodeTree<TNode>,
  path = 'tree',
): void {
  if (!tree.nodes[tree.rootNodeId]) {
    throw new Error(`${path}.rootNodeId: root node "${tree.rootNodeId}" not found in nodes`)
  }

  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (node.id !== nodeId) {
      throw new Error(`${path}.nodes.${nodeId}.id: expected "${nodeId}", received "${node.id}"`)
    }
    for (const childId of node.children) {
      if (!tree.nodes[childId]) {
        throw new Error(`${path}.nodes.${nodeId}.children: child node "${childId}" not found in nodes`)
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(nodeId: string, stack: string[]): void {
    if (visiting.has(nodeId)) {
      throw new Error(`${path}: cycle detected at "${nodeId}" (${[...stack, nodeId].join(' -> ')})`)
    }
    if (visited.has(nodeId)) return

    visiting.add(nodeId)
    const node = tree.nodes[nodeId]
    for (const childId of node.children) visit(childId, [...stack, nodeId])
    visiting.delete(nodeId)
    visited.add(nodeId)
  }

  visit(tree.rootNodeId, [])
}

export function parsePageNodeTree(value: unknown, path = 'tree'): NodeTree<PageNode> {
  if (!compiledCheck(NodeTreeSchema, value)) {
    throw new Error(`${path}: ${formatValueErrors(NodeTreeSchema, value)}`)
  }
  const tree = compiledDecode(NodeTreeSchema, value) as NodeTree<PageNode>
  assertValidNodeTree(tree, path)
  // Derive the parentId index from the children arrays — keeps plugin/test
  // entry trees consistent without trusting a stored parentId value.
  reindexNodeParents(tree.nodes)
  return tree
}
