/**
 * LabeledControl — small label + control row used by the flex / grid
 * sub-fields. Shared wrapper so every visual switcher in this section uses
 * the same set/unset label language as ClassPropertyRow.
 *
 * (Currently LayoutSection-only. If PositionSection or another visual
 * section needs the same label row, promote this to a shared property-control
 * primitive — nothing here is LayoutSection-specific.)
 */

import type { ReactNode } from 'react'
import styles from '../LayoutSection.module.css'

interface LabeledControlProps {
  label: string
  /**
   * Whether the underlying CSS property has a value set. Toggles the label
   * between brighter (set) and muted (unset) — same set/unset language as
   * ClassPropertyRow so visual switchers and generic property rows share a
   * single visual cue for "this property is/isn't set".
   */
  isSet?: boolean
  children: ReactNode
}

export function LabeledControl({ label, isSet, children }: LabeledControlProps) {
  return (
    <div className={styles.labeledRow} data-state={isSet ? 'set' : 'unset'}>
      <span className={styles.labeledLabel}>{label}</span>
      <div className={styles.labeledControl}>{children}</div>
    </div>
  )
}
