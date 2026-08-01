/**
 * DataGridViewChips — the pill-style status/scope filter row shown for
 * publish-workflow tables (posts, pages, components).
 */
import type { ReactElement } from 'react'
import { Button } from '@ui/components/Button'
import type { StatusCounts, StatusFilter, StatusViewChip } from './dataGridRows'
import styles from './DataGrid.module.css'

interface DataGridViewChipsProps {
  views: StatusViewChip[]
  active: StatusFilter
  counts: StatusCounts
  onSelect: (key: StatusFilter) => void
}

export function DataGridViewChips({
  views,
  active,
  counts,
  onSelect,
}: DataGridViewChipsProps): ReactElement {
  return (
    <div className={styles.viewChips}>
      {views.map((view) => {
        const isActive = active === view.key
        // Status dots only make sense for true row.status values — the
        // 'pages' / 'templates' chips on the pages table are template-flag
        // refinements, not statuses.
        const showDot =
          view.key === 'published' || view.key === 'draft' || view.key === 'unpublished'
        return (
          <Button
            key={view.key}
            variant="ghost"
            size="sm"
            shape="pill"
            pressed={isActive}
            className={styles.pill}
            onClick={() => onSelect(view.key)}
          >
            {showDot && (
              <span className={styles.pillDot} data-status={view.key} aria-hidden="true" />
            )}
            <span>{view.label}</span>
            <span className={styles.pillCount}>{counts[view.key]}</span>
          </Button>
        )
      })}
    </div>
  )
}
