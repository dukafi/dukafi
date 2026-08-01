import { useState, type ReactNode } from 'react'
import { ExpansionStore } from './expansionStore'
import { ExpansionStoreContext } from './DomTreeContext'

export function DomTreeProvider({ children }: { children: ReactNode }) {
  // useState lazy init — allowed; creates the store exactly once per provider mount.
  // The provided value is the stable store ref → context never changes →
  // zero context-driven re-renders across the entire TreeNode subtree.
  const [store] = useState(() => new ExpansionStore())
  return (
    <ExpansionStoreContext.Provider value={store}>
      {children}
    </ExpansionStoreContext.Provider>
  )
}
