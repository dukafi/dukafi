import { createContext, use } from 'react'
import type { DomDropTarget } from './domPanelDnd'

export interface DomPanelDndContextValue {
  activeId: string | null
  target: DomDropTarget | null
  invalidOverId: string | null
  registerRow: (nodeId: string, element: HTMLElement | null) => void
}

const missingProvider = () => {
  throw new Error('DomPanelDndContext must be used inside DomPanelDndContext.Provider')
}

export const DomPanelDndContext = createContext<DomPanelDndContextValue>({
  activeId: null,
  target: null,
  invalidOverId: null,
  registerRow: missingProvider,
})

export function useDomPanelDndContext(): DomPanelDndContextValue {
  return use(DomPanelDndContext)
}
