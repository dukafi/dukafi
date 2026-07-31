/**
 * DataGridGroupHeader — a collapsible status section header (Published /
 * Scheduled / Drafts / Archived) spanning the full grid width.
 *
 * The outer <button> carries the grid-spanning background; the inner span is
 * `position: sticky; left: 14px` so the label cluster stays pinned to the
 * left edge of the scroll viewport during horizontal scroll.
 */
import type { ReactElement } from 'react'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import type { DataRowStatus } from '@core/data/schemas'
import type { RowGroup } from './dataGridRows'
import styles from './DataGrid.module.css'

interface DataGridGroupHeaderProps {
  group: RowGroup
  collapsed: boolean
  onToggle: (status: DataRowStatus) => void
}

export function DataGridGroupHeader({
  group,
  collapsed,
  onToggle,
}: DataGridGroupHeaderProps): ReactElement | null {
  if (group.status == null) return null
  const status = group.status
  return (
    <button
      type="button"
      className={styles.groupHeader}
      data-collapsed={collapsed ? 'true' : undefined}
      onClick={() => onToggle(status)}
    >
      <span className={styles.groupHeaderInner}>
        <span className={styles.groupChev}>
          <ChevronDownIcon size={10} aria-hidden="true" />
        </span>
        <span className={styles.groupTitle}>
          <span className={styles.groupDot} data-status={status} aria-hidden="true" />
          {group.label}
          <span className={styles.groupCount}>{group.rows.length}</span>
        </span>
      </span>
    </button>
  )
}
