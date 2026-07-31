import { useEffect } from 'react'
import { useWorkspaceLayout, clampSidebarWidth } from './workspaceLayout'
import {
  readWorkspaceLayout,
  writeWorkspaceLayout,
  type EditorWorkspaceId,
  type StoredWorkspaceLayout,
} from './workspaceLayoutStorage'

type WorkspaceLayoutSelection = readonly [
  leftSidebarWidth: number,
  rightPanelCollapsed: boolean,
  rightPanelWidth: number,
]

type DataLayoutSelection = readonly [
  leftSidebarWidth: number,
  rightPanelCollapsed: boolean,
  rightPanelWidth: number,
  dataSidebarCollapsed: boolean,
]

function sameSelection<T extends readonly unknown[]>(a: T, b: T): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

function selectWorkspaceLayoutState(): WorkspaceLayoutSelection {
  const state = useWorkspaceLayout.getState()
  return [
    state.leftSidebarWidth,
    state.rightPanel.collapsed,
    state.rightPanel.width,
  ] as const
}

function selectDataLayoutState(): DataLayoutSelection {
  const state = useWorkspaceLayout.getState()
  return [
    state.leftSidebarWidth,
    state.rightPanel.collapsed,
    state.rightPanel.width,
    state.dataSidebarCollapsed,
  ] as const
}

function workspaceLayoutFromSelection(
  selection: WorkspaceLayoutSelection,
  existing: StoredWorkspaceLayout,
): StoredWorkspaceLayout {
  const [leftSidebarWidth, rightPanelCollapsed, rightPanelWidth] = selection
  return {
    ...existing,
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: rightPanelWidth,
    rightOpen: !rightPanelCollapsed,
  }
}

function dataLayoutFromSelection(
  selection: DataLayoutSelection,
  existing: StoredWorkspaceLayout,
): StoredWorkspaceLayout {
  const [leftSidebarWidth, rightPanelCollapsed, rightPanelWidth, dataSidebarCollapsed] = selection
  return {
    ...existing,
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: rightPanelWidth,
    rightOpen: !rightPanelCollapsed,
    leftOpen: !dataSidebarCollapsed,
  }
}

export function useWorkspaceLayoutPersistence(
  workspace: Exclude<EditorWorkspaceId, 'site'>,
): void {
  useEffect(() => {
    const storedLayout = readWorkspaceLayout(workspace)
    useWorkspaceLayout.getState().hydrateWorkspaceLayout(workspace, storedLayout)

    if (workspace === 'data') {
      let prev = selectDataLayoutState()
      const unsubscribe = useWorkspaceLayout.subscribe(() => {
        const selection = selectDataLayoutState()
        if (sameSelection(selection, prev)) return
        prev = selection
        const existing = readWorkspaceLayout('data')
        writeWorkspaceLayout('data', dataLayoutFromSelection(selection, existing))
      })
      return unsubscribe
    }

    let prev = selectWorkspaceLayoutState()
    const unsubscribe = useWorkspaceLayout.subscribe(() => {
      const selection = selectWorkspaceLayoutState()
      if (sameSelection(selection, prev)) return
      prev = selection
      const existing = readWorkspaceLayout(workspace)
      writeWorkspaceLayout(workspace, workspaceLayoutFromSelection(selection, existing))
    })
    return unsubscribe
  }, [workspace])
}
