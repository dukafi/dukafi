/**
 * DataGridSkeletonRows — the per-cell shimmer rows shown while data loads.
 *
 * Shared by the live `DataGrid` (which knows the real column count from
 * `orderedFields`) and the full-canvas `DataGridSkeleton` (which uses a
 * generic column count before any table is selected). Both render the same
 * `display: contents` row shape so the column ladder + sticky positioning is
 * identical to a real row.
 */
import type { CSSProperties, ReactElement } from 'react'
import { cn } from '@ui/cn'
import { Skeleton } from '@ui/components/Skeleton'
import styles from './DataGrid.module.css'

interface DataGridSkeletonRowsProps {
  /** Number of non-primary field cells to render per row. */
  fieldCount: number
  /** How many skeleton rows to render. */
  rowCount?: number
  /** Sticky-left offset for the primary cell (matches the real grid). */
  primaryStickyLeft: CSSProperties
}

export function DataGridSkeletonRows({
  fieldCount,
  rowCount = 8,
  primaryStickyLeft,
}: DataGridSkeletonRowsProps): ReactElement {
  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <div
          key={`skeleton-row-${rowIndex}`}
          className={styles.skeletonRow}
          role="status"
          aria-hidden="true"
        >
          {/* Checkbox column. */}
          <div className={cn(styles.cell, styles.skeletonCell)} data-sticky="checkbox" />
          {/* Primary field — sticky, wider shimmer. */}
          <div
            className={cn(styles.cell, styles.primaryCell, styles.skeletonCell)}
            data-sticky="primary"
            style={primaryStickyLeft}
          >
            <Skeleton width={`${50 + (rowIndex % 4) * 10}%`} height={12} />
          </div>
          {/* Field cells. */}
          {Array.from({ length: fieldCount }, (_, fieldIndex) => (
            <div
              key={`skeleton-${rowIndex}-${fieldIndex}`}
              className={cn(styles.cell, styles.skeletonCell)}
            >
              <Skeleton
                width={`${40 + ((rowIndex + fieldIndex) % 5) * 12}%`}
                height={12}
              />
            </div>
          ))}
          {/* Actions cell. */}
          <div className={cn(styles.cell, styles.skeletonCell)} />
        </div>
      ))}
    </>
  )
}
