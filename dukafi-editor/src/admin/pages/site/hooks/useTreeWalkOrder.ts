/**
 * Returns all ancestor node IDs for the given nodeId (from root down to parent).
 * Used to auto-expand the tree path when a canvas selection targets a hidden node.
 */
export function getAncestorIds(
  nodes: Record<string, { children: string[] }>,
  rootNodeId: string,
  targetId: string,
): string[] {
  // BFS to find path from root to targetId
  const queue: Array<{ nodeId: string; path: string[] }> = [
    { nodeId: rootNodeId, path: [] },
  ]
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!
    if (nodeId === targetId) return path
    const node = nodes[nodeId]
    if (!node) continue
    for (const childId of node.children) {
      queue.push({ nodeId: childId, path: [...path, nodeId] })
    }
  }
  return []
}
