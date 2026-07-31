/**
 * base.slot-outlet editor preview component.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration.
 *
 * Rendered ONLY in VC edit mode (activeDocument.kind === 'visualComponent').
 * In page mode the outlet is satisfied by the matching slot-instance node from
 * the consumer's page tree — showing the dashed placeholder there would be
 * confusing and misleading. The publisher already renders nothing for outlets
 * (their content is injected at the outlet's position from the slot-instance).
 */
import React from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import { resolveSlotName } from '@core/visualComponents'
import { useEditorStore } from '@site/store/store'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { TargetSolidIcon } from 'pixel-art-icons/icons/target-solid'
import type { SlotOutletStoredProps } from './props'

export const SlotOutletEditor: React.FC<ModuleComponentProps<SlotOutletStoredProps>> = ({ props, nodeWrapperProps }) => {
  const isVCEditMode = useEditorStore((s) => s.activeDocument?.kind === 'visualComponent')

  if (!isVCEditMode) return null

  const slotName = resolveSlotName(props)

  return (
    <CanvasModulePlaceholder
      {...nodeWrapperProps}
      variant="inline"
      icon={<TargetSolidIcon size={12} color="currentColor" />}
      label={`Slot: ${slotName}`}
    />
  )
}
