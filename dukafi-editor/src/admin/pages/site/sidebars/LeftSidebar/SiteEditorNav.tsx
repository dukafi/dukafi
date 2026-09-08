/**
 * Site editor groups inside the shared AdminAppSidebar: Layers / Pages /
 * Code / Media plus Framework, Assistant, and any plugin panels.
 */
import { useSyncExternalStore } from 'react'
import { BracesIcon } from 'pixel-art-icons/icons/braces'
import { ColorsSwatchSolidIcon } from 'pixel-art-icons/icons/colors-swatch-solid'
import { FilesStack2SolidIcon } from 'pixel-art-icons/icons/files-stack-2-solid'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { ListBoxSolidIcon } from 'pixel-art-icons/icons/list-box-solid'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import type { IconComponent } from 'pixel-art-icons/types'
import {
  AdminAppSidebar,
  type AdminAppSidebarGroup,
  type AdminAppSidebarItem,
} from '@admin/shared/AdminAppSidebar'
import { pluginRuntime } from '@core/plugins/runtime'
import { useEditorStore } from '@site/store/store'
import type { ExplorerPanelTab, LeftSidebarPanelId } from '@site/store/slices/uiSlice'
import { resolvePluginPanelIcon } from './pluginPanelIcons'

const subscribePluginRuntime = (cb: () => void) => pluginRuntime.subscribe(cb)
const getPluginPanelsSnapshot = () => pluginRuntime.getPanels()
const SERVER_PLUGIN_PANELS_SNAPSHOT: ReturnType<typeof getPluginPanelsSnapshot> = []

const EXPLORER_ITEMS: ReadonlyArray<{
  id: string
  tab: ExplorerPanelTab
  label: string
  icon: IconComponent
}> = [
  { id: 'layers', tab: 'layers', label: 'Layers', icon: ListBoxSolidIcon },
  { id: 'pages', tab: 'site', label: 'Pages', icon: FilesStack2SolidIcon },
  { id: 'code', tab: 'code', label: 'Code', icon: BracesIcon },
  { id: 'explorer-media', tab: 'media', label: 'Media', icon: ImagesSolidIcon },
]

interface SiteEditorNavProps {
  editable: boolean
  railOnly: boolean
}

export function SiteEditorNav({ editable, railOnly }: SiteEditorNavProps) {
  const siteName = useEditorStore((s) => s.site?.name ?? null)
  const explorerOpen = useEditorStore((s) => s.explorerPanelOpen)
  const explorerTab = useEditorStore((s) => s.explorerPanelTab)
  const frameworkOpen = useEditorStore((s) => s.frameworkPanelOpen)
  const aiOpen = useEditorStore((s) => s.aiPanelOpen)
  const activePluginPanelId = useEditorStore((s) => s.activePluginPanelId)
  const setExplorerPanelTab = useEditorStore((s) => s.setExplorerPanelTab)
  const setLeftSidebarPanel = useEditorStore((s) => s.setLeftSidebarPanel)
  const setActivePluginPanel = useEditorStore((s) => s.setActivePluginPanel)
  const setPropertiesPanel = useEditorStore((s) => s.setPropertiesPanel)

  const pluginPanels = useSyncExternalStore(
    subscribePluginRuntime,
    getPluginPanelsSnapshot,
    () => SERVER_PLUGIN_PANELS_SNAPSHOT,
  )

  function revealBuiltIn(panel: LeftSidebarPanelId) {
    setPropertiesPanel({ collapsed: true })
    setLeftSidebarPanel(panel)
  }

  function openExplorerTab(tab: ExplorerPanelTab) {
    setExplorerPanelTab(tab)
    if (!explorerOpen) setPropertiesPanel({ collapsed: true })
    setLeftSidebarPanel('explorer')
  }

  const explorerItems: AdminAppSidebarItem[] = EXPLORER_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    active: !railOnly && explorerOpen && explorerTab === item.tab && activePluginPanelId === null,
    onClick: () => openExplorerTab(item.tab),
  }))

  const editorItems: AdminAppSidebarItem[] = editable
    ? [
        ...explorerItems,
        {
          id: 'framework',
          label: 'Framework',
          icon: ColorsSwatchSolidIcon,
          active: !railOnly && frameworkOpen && activePluginPanelId === null,
          onClick: () => revealBuiltIn('framework'),
        },
        {
          id: 'ai',
          label: 'Assistant',
          icon: SparklesSolidIcon,
          active: !railOnly && aiOpen && activePluginPanelId === null,
          onClick: () => revealBuiltIn('ai'),
        },
        ...pluginPanels.map((panel) => ({
          id: `plugin:${panel.id}`,
          label: panel.label,
          icon: resolvePluginPanelIcon(panel.iconName),
          active: !railOnly && activePluginPanelId === panel.id,
          onClick: () => {
            setPropertiesPanel({ collapsed: true })
            setActivePluginPanel(panel.id)
          },
        })),
      ]
    : explorerItems

  const groups: AdminAppSidebarGroup[] = [
    { id: 'editor', label: 'Editor', items: editorItems },
  ]

  return (
    <AdminAppSidebar
      workspace="site"
      brand={siteName}
      groups={groups}
    />
  )
}
