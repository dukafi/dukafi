/**
 * ExpansionStore — external observable for DOM tree expand/collapse state.
 *
 * Kept out of React state so a single toggle notifies ONLY the toggled row
 * (subscribed via useSyncExternalStore in useIsNodeExpanded) instead of
 * recreating a context value object that re-renders every TreeNode consumer.
 *
 * All public methods are arrow class fields so their references are
 * permanently stable — no bind(), no useCallback() needed at call sites.
 */
export class ExpansionStore {
  private expanded = new Set<string>()
  private listeners = new Set<() => void>()

  private notify = () => {
    for (const l of this.listeners) l()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  isExpanded = (nodeId: string): boolean => this.expanded.has(nodeId)

  toggle = (nodeId: string): void => {
    if (this.expanded.has(nodeId)) {
      this.expanded.delete(nodeId)
    } else {
      this.expanded.add(nodeId)
    }
    this.notify()
  }

  /** Add a single node to the expanded set. No-op (no notification) if already expanded. */
  expand = (nodeId: string): void => {
    if (this.expanded.has(nodeId)) return
    this.expanded.add(nodeId)
    this.notify()
  }

  expandAll = (nodeIds: string[]): void => {
    this.expanded = new Set(nodeIds)
    this.notify()
  }

  collapseAll = (): void => {
    this.expanded = new Set()
    this.notify()
  }
}
