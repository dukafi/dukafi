/**
 * base.slot-instance editor preview component.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration.
 *
 * Renders a labeled drop-zone container showing the slot name in the header
 * and the user-authored slot content (children) in the body. The visual
 * treatment makes it clear this is a structural VC slot, not a plain container.
 */
import React from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import { resolveSlotName } from '@core/visualComponents'
import { TargetSolidIcon } from 'pixel-art-icons/icons/target-solid'
import styles from './SlotInstance.module.css'
import type { SlotInstanceStoredProps } from './props'

export const SlotInstanceEditor: React.FC<ModuleComponentProps<SlotInstanceStoredProps>> = ({
  props,
  children,
  nodeWrapperProps,
}) => {
  const slotName = resolveSlotName(props)

  return (
    <div {...nodeWrapperProps} className={styles.container} data-instatic-slot-instance="">
      <div className={styles.header} data-instatic-slot-instance-header="">
        <TargetSolidIcon size={11} color="currentColor" aria-hidden="true" />
        <span className={styles.label} data-instatic-slot-label="">Slot: {slotName}</span>
      </div>
      <div className={styles.content} data-instatic-slot-instance-content="">{children}</div>
    </div>
  )
}
