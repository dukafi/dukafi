import { useRef, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import type { LeftSidebarPanelId } from '@site/store/slices/uiSlice'
import { FrameworkPanel } from '@site/panels/FrameworkPanel'
import { ExplorerPanel } from '@site/panels/ExplorerPanel'
import { AiPanel } from '@site/panels/AiPanel'
import { FrameworkChangeConfirmProvider } from '@admin/shared/dialogs/FrameworkChangeConfirmDialog'
import { VCDeletionConfirmProvider } from '@admin/shared/dialogs/VCDeletionConfirmDialog'
import { SidebarResizeHandle } from '@admin/shared/SidebarResizeHandle'
import {
  PanelResizeHandle,
  useDraggablePanel,
  useResizablePanel,
} from '@admin/shared/FloatingWindow'
import { cn } from '@ui/cn'
import { SiteEditorNav } from './SiteEditorNav'
import styles from './LeftSidebar.module.css'

type HostedLeftPanelId = LeftSidebarPanelId

function selectActiveLeftSidebarPanel(
  state: ReturnType<typeof useEditorStore.getState>,
): HostedLeftPanelId | null {
  // A plugin panel takes precedence over the built-in `*PanelOpen` flags;
  // the LeftSidebar reads `activePluginPanelId` separately and shows the
  // plugin mount when set.
  if (state.activePluginPanelId !== null) return null
  if (state.explorerPanelOpen) return 'explorer'
  if (state.frameworkPanelOpen) return 'framework'
  if (state.aiPanelOpen) return 'ai'
  return null
}

interface LeftSidebarProps {
  workspace?: 'site' | 'content' | 'media'
  railOnly?: boolean
  /**
   * Whether the caller can perform structural edits (DnD, add/remove nodes,
   * pages, styles). Controls which editor groups appear in the sidebar.
   *
   * Falsy callers (Viewer / Client) still see Layers / Pages / Code / Media
   * — they're not editing tools. Framework and Assistant stay hidden.
   *
   * Each panel is responsible for respecting its own read-only state for
   * the interactions it exposes (TreeNode drag, context menus, etc.).
   */
  editable?: boolean
}

/**
 * Set of panels that remain visible to read-only callers — purely
 * navigational / view surfaces. Anything not in this set is editing-only
 * and is dropped from the sidebar (and its panel mount) when `editable=false`.
 */
const READ_ONLY_RAIL_IDS: ReadonlySet<LeftSidebarPanelId> = new Set(['explorer'])
const PANEL_RESIZE_LABELS: Record<HostedLeftPanelId, string> = {
  explorer: 'Explorer',
  framework: 'Framework',
  ai: 'Assistant',
}

export function LeftSidebar({
  railOnly = false,
  editable = true,
}: LeftSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const activePanel = useEditorStore(selectActiveLeftSidebarPanel)
  const activePluginPanelId = useEditorStore((s) => s.activePluginPanelId)
  const leftSidebarWidth = useEditorStore((s) => s.leftSidebarWidth)
  const leftSidebarMode = useEditorStore((s) => s.leftSidebarMode)
  const setLeftSidebarWidth = useEditorStore((s) => s.setLeftSidebarWidth)
  const setLeftSidebarMode = useEditorStore((s) => s.setLeftSidebarMode)
  // When the user can't edit structure, drop them onto Layers if they had a
  // hidden-for-them panel active (selectors, colors, …). Plugin panels are
  // editing-only by definition.
  const effectiveActivePanel =
    activePanel && canShowBuiltInPanel(activePanel, editable)
      ? activePanel
      : editable
        ? null
        : 'explorer'
  const effectivePluginPanelId = editable ? activePluginPanelId : null
  // Sidebar is "expanded" whenever a built-in OR plugin panel is showing.
  const sidebarOpen = Boolean(effectiveActivePanel) || effectivePluginPanelId !== null
  const panelFloating = sidebarOpen && leftSidebarMode === 'floating'
  const panelExpanded = sidebarOpen && leftSidebarMode === 'docked' && !railOnly
  const panelVisible = panelExpanded || panelFloating
  const panelWidth = panelExpanded ? leftSidebarWidth : 0
  const panelResizeLabel = effectivePluginPanelId !== null
    ? 'plugin'
    : effectiveActivePanel
      ? PANEL_RESIZE_LABELS[effectiveActivePanel]
      : 'left sidebar'
  const {
    panelRef,
    setPanelRef,
    headerDragProps,
    panelPositionStyle,
  } = useDraggablePanel('site', () => ({ x: 192, y: 64 }))
  const {
    panelSizeStyle,
    resizeHandleProps,
  } = useResizablePanel(
    'site',
    panelRef,
    () => ({ width: leftSidebarWidth, height: 520 }),
  )

  const togglePanelMode = () => {
    setLeftSidebarMode(leftSidebarMode === 'docked' ? 'floating' : 'docked')
  }
  const dockablePanelProps = {
    mode: leftSidebarMode,
    dragHandleProps: panelFloating ? headerDragProps : undefined,
    onToggleMode: togglePanelMode,
  } as const

  const style = {
    '--left-sidebar-panel-width': `${panelWidth}px`,
    '--left-sidebar-panel-layout-width': `${panelExpanded ? leftSidebarWidth : 0}px`,
  } as CSSProperties

  return (
    <aside
      ref={sidebarRef}
      className={styles.sidebar}
      data-testid="left-sidebar"
      data-expanded={panelExpanded ? 'true' : 'false'}
      data-rail-only={railOnly ? 'true' : undefined}
      data-active-panel={effectivePluginPanelId !== null
        ? `plugin:${effectivePluginPanelId}`
        : effectiveActivePanel ?? 'none'}
      style={style}
    >
      <SiteEditorNav editable={editable} railOnly={railOnly} />

      <FrameworkChangeConfirmProvider>
      <VCDeletionConfirmProvider>
        <div
          ref={panelFloating ? setPanelRef : undefined}
          className={cn(styles.panelSlot, panelFloating && styles.panelSlotFloating)}
          data-testid="left-sidebar-panel-slot"
          data-mode={leftSidebarMode}
          inert={panelVisible ? undefined : true}
          style={panelFloating ? { ...panelPositionStyle, ...panelSizeStyle } : undefined}
        >
          {/* Read-only-safe panels — always rendered for any role with
              `site.read`. These are navigation/inspection surfaces, not
              editing tools; each respects its own read-only state internally
              (e.g. TreeNode disables drag + context menu via `editable`). */}
          <div className={styles.panelMount} hidden={effectiveActivePanel !== 'explorer'}>
            <ExplorerPanel editable={editable} {...dockablePanelProps} />
          </div>
          {/* Editor-only panels — only mounted when the caller can perform
              structural edits. Mounting them for non-editors would expose
              actions (style edits, framework token changes, plugin panels)
              they have no capability to commit. */}
          {editable && (
            <>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'framework'}>
                <FrameworkPanel {...dockablePanelProps} />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'ai'}>
                <AiPanel {...dockablePanelProps} />
              </div>
            </>
          )}
          {panelFloating && (
            <PanelResizeHandle
              panelLabel={panelResizeLabel}
              resizeHandleProps={resizeHandleProps}
            />
          )}
        </div>
      </VCDeletionConfirmProvider>
      </FrameworkChangeConfirmProvider>

      {panelExpanded && (
        <SidebarResizeHandle
          side="left"
          width={leftSidebarWidth}
          targetRef={sidebarRef}
          cssVariable="--left-sidebar-panel-width"
          layoutCssVariable="--left-sidebar-panel-layout-width"
          ariaLabel="Resize left sidebar"
          onResize={setLeftSidebarWidth}
        />
      )}
    </aside>
  )
}

function canShowBuiltInPanel(
  panel: LeftSidebarPanelId,
  editable: boolean,
): boolean {
  return editable || READ_ONLY_RAIL_IDS.has(panel)
}
