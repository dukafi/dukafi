import { rawReturn } from 'mutative'
import type { StoreApi, UseBoundStore } from 'zustand'
import type { EditorStore } from '@site/store/types'
import type { ExplorerPanelTab } from '@site/store/slices/uiSlice'
import {
  readWorkspaceLayout,
  writeWorkspaceLayout,
  type PanelMode,
  type StoredWorkspaceLayout,
} from '@admin/state/workspaceLayoutStorage'
import {
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  clampSidebarWidth,
} from '@admin/state/workspaceLayout'

type EditorStoreApi = UseBoundStore<StoreApi<EditorStore>>

export type SiteLayoutSelection = readonly [
  explorerOpen: boolean,
  propertiesOpen: boolean,
  frameworkOpen: boolean,
  codeEditorOpen: boolean,
  explorerTab: ExplorerPanelTab,
  propertiesMode: PanelMode,
  leftSidebarMode: PanelMode,
  leftSidebarWidth: number,
  propertiesWidth: number,
  activeEditorFileId: string | null,
]

function boolOrCurrent(value: unknown, current: boolean): boolean {
  return typeof value === 'boolean' ? value : current
}

function finiteNumberOrCurrent(value: unknown, current: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : current
}

function explorerTab(
  value: unknown,
  current: ExplorerPanelTab,
): ExplorerPanelTab {
  return value === 'layers' || value === 'site' || value === 'code' || value === 'media'
    ? value
    : current
}

function propertiesMode(
  layout: StoredWorkspaceLayout,
  currentMode: PanelMode,
): PanelMode {
  const mode = layout.propertiesPanelMode
  return mode === 'floating' || mode === 'docked' ? mode : currentMode
}

function storedPanelMode(value: unknown, currentMode: PanelMode): PanelMode {
  return value === 'floating' || value === 'docked' ? value : currentMode
}

function leftSidebarWidth(layout: StoredWorkspaceLayout, currentWidth: number): number {
  return clampSidebarWidth(finiteNumberOrCurrent(
    layout.leftWidth,
    currentWidth || LEFT_SIDEBAR_DEFAULT_WIDTH,
  ))
}

export function selectSiteLayoutState(s: EditorStore): SiteLayoutSelection {
  return [
    s.explorerPanelOpen,
    !s.propertiesPanel.collapsed,
    s.frameworkPanelOpen,
    s.codeEditorPanelOpen,
    s.explorerPanelTab,
    s.propertiesPanelMode,
    s.leftSidebarMode,
    s.leftSidebarWidth,
    s.propertiesPanel.width,
    s.activeEditorFileId,
  ] as const
}

export function sameLayoutSelection<T extends readonly unknown[]>(a: T, b: T): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

function deriveSiteActiveLeftPanel(selection: SiteLayoutSelection): string | null {
  const [
    explorerOpen,
    ,
    frameworkOpen,
  ] = selection

  if (explorerOpen) return 'explorer'
  if (frameworkOpen) return 'framework'
  return null
}

export function siteLayoutFromSelection(
  selection: SiteLayoutSelection,
): StoredWorkspaceLayout {
  const [
    ,
    propertiesOpen,
    ,
    codeEditorOpen,
    explorerTab,
    propertiesMode,
    leftSidebarMode,
    leftSidebarWidth,
    propertiesWidth,
    activeEditorFileId,
  ] = selection

  return {
    leftWidth: clampSidebarWidth(leftSidebarWidth),
    rightWidth: propertiesWidth,
    leftOpen: deriveSiteActiveLeftPanel(selection) !== null,
    rightOpen: propertiesOpen,
    activeLeftPanel: deriveSiteActiveLeftPanel(selection),
    explorerPanelTab: explorerTab,
    activeEditorFileId,
    codeEditorPanelOpen: codeEditorOpen,
    propertiesPanelMode: propertiesMode,
    leftSidebarMode,
  }
}

export function restoreStoredSiteEditorLayout(
  api: EditorStoreApi,
  layout: StoredWorkspaceLayout,
): void {
  api.setState((state) => {
    const propertiesOpen = boolOrCurrent(layout.rightOpen, !state.propertiesPanel.collapsed)
    const storedActivePanel = layout.activeLeftPanel
    const applyLeftPanel = storedActivePanel !== undefined
    const leftPanelPatch = applyLeftPanel
      ? {
          explorerPanelOpen: storedActivePanel === 'explorer',
          frameworkPanelOpen: storedActivePanel === 'framework',
        }
      : {}

    return rawReturn({
      propertiesPanel: {
        ...state.propertiesPanel,
        collapsed: !propertiesOpen,
        width: finiteNumberOrCurrent(layout.rightWidth, state.propertiesPanel.width),
      },
      propertiesPanelMode: propertiesMode(layout, state.propertiesPanelMode),
      leftSidebarMode: storedPanelMode(layout.leftSidebarMode, state.leftSidebarMode),
      leftSidebarWidth: leftSidebarWidth(layout, state.leftSidebarWidth),
      explorerPanelTab: explorerTab(layout.explorerPanelTab, state.explorerPanelTab),
      codeEditorPanelOpen: boolOrCurrent(layout.codeEditorPanelOpen, state.codeEditorPanelOpen),
      activeEditorFileId: layout.activeEditorFileId !== undefined
        ? layout.activeEditorFileId
        : state.activeEditorFileId,
      ...leftPanelPatch,
    } satisfies Partial<EditorStore>)
  })
}

export function restorePersistedSiteEditorLayout(api: EditorStoreApi): void {
  restoreStoredSiteEditorLayout(api, readWorkspaceLayout('site'))
}

export function writeSiteEditorLayout(selection: SiteLayoutSelection): void {
  writeWorkspaceLayout('site', siteLayoutFromSelection(selection))
}
