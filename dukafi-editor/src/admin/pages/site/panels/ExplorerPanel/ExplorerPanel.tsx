/**
 * ExplorerPanel — the consolidated navigation panel.
 *
 * One `<Panel>` shell hosting Layers (DOM tree), Pages (pages/templates/
 * components), Code (stylesheets + scripts), and Media. The sidebar owns
 * which body is showing; this shell owns the chrome (header + close).
 *
 * The Pages and Code views are both served by a SINGLE `SiteExplorerPanel`
 * mount (its `sectionGroup` prop selects which sections show). Two separate
 * instances would each register their own `useDndMonitor`, double-handling
 * every explorer drag — so they deliberately share one instance + DnD scope.
 */
import { useEditorStore } from '@site/store/store'
import { Panel, type DockablePanelProps } from '@admin/shared/Panel'
import { DomPanel } from '@site/panels/DomPanel'
import { SiteExplorerPanel } from '@site/panels/SiteExplorerPanel'
import { MediaExplorerPanel } from '@site/panels/MediaExplorerPanel'
import type { ExplorerPanelTab } from '@site/store/slices/uiSlice'
import styles from './ExplorerPanel.module.css'

const TAB_TITLES: Record<ExplorerPanelTab, string> = {
  layers: 'Layers',
  site: 'Pages',
  code: 'Code',
  media: 'Media',
}

interface ExplorerPanelProps extends DockablePanelProps {
  /** Whether the caller can perform structural edits (drives DnD/insert). */
  editable?: boolean
}

export function ExplorerPanel({
  editable = true,
  mode,
  dragHandleProps,
  onToggleMode,
}: ExplorerPanelProps) {
  const tab = useEditorStore((s) => s.explorerPanelTab)
  const setOpen = useEditorStore((s) => s.setExplorerPanelOpen)
  const title = TAB_TITLES[tab]

  return (
    <Panel
      panelId="explorer"
      title={title}
      testId="explorer-panel"
      onClose={() => setOpen(false)}
      mode={mode}
      dragHandleProps={dragHandleProps}
      onToggleMode={onToggleMode}
      dockLocation="left sidebar"
      body="bare"
    >
      <div className={styles.tabBody}>
        <div className={styles.tabMount} hidden={tab !== 'layers'}>
          <DomPanel editable={editable} />
        </div>
        {/* Single SiteExplorerPanel serves both the Pages and Code views; the
            `sectionGroup` prop picks which sections render. */}
        <div className={styles.tabMount} hidden={tab !== 'site' && tab !== 'code'}>
          <SiteExplorerPanel
            sectionGroup={tab === 'code' ? 'code' : 'site'}
            organizationDndEnabled={editable}
          />
        </div>
        <div className={styles.tabMount} hidden={tab !== 'media'}>
          <MediaExplorerPanel variant="tab" />
        </div>
      </div>
    </Panel>
  )
}
