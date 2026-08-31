/**
 * FrameworkPanel — design tokens as stacked accordions.
 *
 * Schemes sit at the top. Colors, Type, and Space fold open below. The header
 * action still opens the Manage Core Framework dialog.
 */
import { useEffect, useState } from 'react'
import { useEditorStore } from '@site/store/store'
import { Panel, type DockablePanelProps } from '@admin/shared/Panel'
import { Button } from '@ui/components/Button'
import { Section } from '@ui/components/Section'
import { SlidersHorizontalIcon } from 'pixel-art-icons/icons/sliders-horizontal'
import { ColorsSwatchSolidIcon } from 'pixel-art-icons/icons/colors-swatch-solid'
import { TextStartTIcon } from 'pixel-art-icons/icons/text-start-t'
import { RulerDimensionSolidIcon } from 'pixel-art-icons/icons/ruler-dimension-solid'
import { ColorsPanelBody } from '@site/panels/ColorsPanel'
import { SchemesPanel } from '@site/panels/SchemesPanel'
import { TypographyTab } from '@site/panels/TypographyPanel'
import { SpacingTab } from '@site/panels/SpacingPanel'
import type { FrameworkPanelTab } from '@site/store/slices/uiSlice'
import { FrameworkManagerHost } from './FrameworkManagerHost'
import styles from './FrameworkPanel.module.css'

const SECTIONS: ReadonlyArray<{
  id: FrameworkPanelTab
  title: string
  icon: typeof ColorsSwatchSolidIcon
}> = [
  { id: 'schemes', title: 'Schemes', icon: ColorsSwatchSolidIcon },
  { id: 'colors', title: 'Colors', icon: ColorsSwatchSolidIcon },
  { id: 'typography', title: 'Type', icon: TextStartTIcon },
  { id: 'spacing', title: 'Space', icon: RulerDimensionSolidIcon },
]

const INITIAL_OPEN: Record<FrameworkPanelTab, boolean> = {
  schemes: true,
  colors: false,
  typography: false,
  spacing: false,
}

export function FrameworkPanel({
  mode,
  dragHandleProps,
  onToggleMode,
}: DockablePanelProps) {
  const tab = useEditorStore((s) => s.frameworkPanelTab)
  const setOpen = useEditorStore((s) => s.setFrameworkPanelOpen)
  const setManagerOpen = useEditorStore((s) => s.setFrameworkManagerOpen)
  const [openSections, setOpenSections] = useState(INITIAL_OPEN)

  useEffect(() => {
    setOpenSections((current) => (current[tab] ? current : { ...current, [tab]: true }))
  }, [tab])

  return (
    <Panel
      panelId="framework"
      title="Framework"
      testId="framework-panel"
      onClose={() => setOpen(false)}
      mode={mode}
      dragHandleProps={dragHandleProps}
      onToggleMode={onToggleMode}
      dockLocation="left sidebar"
      headerActions={
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label="Manage Core Framework"
          tooltip="Manage framework"
          onClick={() => setManagerOpen(true)}
        >
          <SlidersHorizontalIcon size={13} aria-hidden="true" />
        </Button>
      }
      body="bare"
    >
      <div className={styles.accordions}>
        {SECTIONS.map((section) => (
          <Section
            key={section.id}
            title={section.title}
            icon={section.icon}
            open={openSections[section.id]}
            onOpenChange={(next) => setOpenSections((current) => ({ ...current, [section.id]: next }))}
          >
            {section.id === 'schemes' && <SchemesPanel />}
            {section.id === 'colors' && <ColorsPanelBody />}
            {section.id === 'typography' && <TypographyTab />}
            {section.id === 'spacing' && <SpacingTab />}
          </Section>
        ))}
      </div>

      <FrameworkManagerHost />
    </Panel>
  )
}
