/**
 * MediaSidebar — grouped admin nav + panel slot for the Media workspace.
 *
 * Workspace destinations live in AdminAppSidebar. Library items (Folders,
 * Storage) open the panel beside the nav. The Folders panel owns the entire
 * folder tree, including smart folders and Trash.
 */
import { useRef, type CSSProperties } from 'react'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import type { IconComponent } from 'pixel-art-icons/types'
import { AdminAppSidebar, type AdminAppSidebarItem } from '@admin/shared/AdminAppSidebar'
import { useWorkspaceLayout } from '@admin/state/workspaceLayout'
import { hasCapability } from '@admin/access'
import { useCurrentAdminUser } from '@admin/sessionContext'
import { useAdminUi } from '@admin/state/adminUi'
import { SidebarResizeHandle } from '@admin/shared/SidebarResizeHandle'
import { Panel } from '@admin/shared/Panel'
import leftSidebarStyles from '@site/sidebars/LeftSidebar/LeftSidebar.module.css'
import { MediaFolderPanel } from '../MediaFolderPanel/MediaFolderPanel'
import { MediaStoragePanel } from '../MediaStoragePanel/MediaStoragePanel'
import type { UseMediaWorkspaceResult } from '../../hooks/useMediaWorkspace'

export type MediaSidebarPanelId = 'folders' | 'storage'

interface MediaSidebarProps {
  workspace: UseMediaWorkspaceResult
  activePanel: MediaSidebarPanelId | null
  onActivePanelChange: (panel: MediaSidebarPanelId | null) => void
}

interface LibraryItem {
  id: MediaSidebarPanelId
  label: string
  icon: IconComponent
}

const ALL_LIBRARY_ITEMS: LibraryItem[] = [
  { id: 'folders', label: 'Folders', icon: FolderGlyphIcon },
  { id: 'storage', label: 'Storage', icon: CloudUploadSolidIcon },
]

const PANEL_TITLES: Record<MediaSidebarPanelId, string> = {
  folders: 'Folders',
  storage: 'Storage',
}

export function MediaSidebar({ workspace, activePanel, onActivePanelChange }: MediaSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const leftSidebarWidth = useWorkspaceLayout((s) => s.leftSidebarWidth)
  const setLeftSidebarWidth = useWorkspaceLayout((s) => s.setLeftSidebarWidth)
  const currentUser = useCurrentAdminUser()
  const siteName = useAdminUi((s) => s.siteName)
  const panelWidth = activePanel ? leftSidebarWidth : 0
  const style = {
    '--left-sidebar-panel-width': `${panelWidth}px`,
    '--left-sidebar-panel-layout-width': `${leftSidebarWidth}px`,
  } as CSSProperties

  const libraryItems: AdminAppSidebarItem[] = ALL_LIBRARY_ITEMS
    .filter((item) => item.id !== 'storage' || hasCapability(currentUser, 'storage.elect'))
    .map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: activePanel === item.id,
      testId: `media-panel-rail-${item.id}`,
      onClick: () => onActivePanelChange(item.id),
    }))

  if (activePanel === 'storage' && !libraryItems.some((item) => item.id === 'storage')) {
    onActivePanelChange(null)
  }

  return (
    <aside
      ref={sidebarRef}
      className={leftSidebarStyles.sidebar}
      data-testid="media-left-sidebar"
      data-expanded={activePanel ? 'true' : 'false'}
      data-active-panel={activePanel ?? 'none'}
      style={style}
    >
      <AdminAppSidebar
        workspace="media"
        brand={siteName}
        groups={[{ id: 'library', label: 'Library', items: libraryItems }]}
      />

      <div
        className={leftSidebarStyles.panelSlot}
        data-testid="media-left-sidebar-panel-slot"
        inert={activePanel ? undefined : true}
      >
        <div className={leftSidebarStyles.panelMount}>
          {activePanel && (
            <Panel
              panelId={`media-${activePanel}`}
              title={PANEL_TITLES[activePanel]}
              ariaLabel={`${PANEL_TITLES[activePanel]} panel`}
              testId={`media-${activePanel}-panel`}
              onClose={() => onActivePanelChange(null)}
              body={activePanel === 'folders' ? 'bare' : 'padded'}
            >
              {activePanel === 'folders' ? (
                <MediaFolderPanel workspace={workspace} />
              ) : (
                <MediaStoragePanel />
              )}
            </Panel>
          )}
        </div>
      </div>

      {activePanel && (
        <SidebarResizeHandle
          side="left"
          width={leftSidebarWidth}
          targetRef={sidebarRef}
          cssVariable="--left-sidebar-panel-width"
          layoutCssVariable="--left-sidebar-panel-layout-width"
          ariaLabel="Resize media sidebar"
          onResize={setLeftSidebarWidth}
        />
      )}
    </aside>
  )
}
