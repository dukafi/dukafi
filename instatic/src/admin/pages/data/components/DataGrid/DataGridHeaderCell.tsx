import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { ArrowDownIcon } from 'pixel-art-icons/icons/arrow-down'
import type { DataField } from '@core/data/schemas'
import { getFieldIcon } from '@admin/pages/data/utils/fieldIcons'
import styles from './DataGrid.module.css'

interface DataGridHeaderCellProps {
  field: DataField
  /** True when this field is the table's `primaryFieldId`. */
  isPrimary?: boolean
  /** Current sort direction for this column, or null if not sorted. */
  sortDir?: 'asc' | 'desc' | null
  /** Sticky bucket — currently only 'primary' is used by DataGrid. */
  sticky?: 'primary'
  /** Inline style applied for sticky positioning (provides `left`). */
  stickyStyle?: CSSProperties
  /** Called when the header is clicked — typically toggles the sort. */
  onClickHeader?: (fieldId: string) => void
  /**
   * When set, renders a column-resize handle at the right edge of the cell.
   * Called on `mousedown` with the original React event — the parent owns
   * the global mousemove/mouseup tracking so it can clamp the new width
   * and persist it.
   */
  onResizeStart?: (e: ReactMouseEvent) => void
}

/**
 * Renders a column header cell for the DataGrid.
 *
 * The icon is rendered by calling `getFieldIcon(field.type)({ size })` directly
 * rather than as a JSX element — see the longer comment that was here before:
 * pixel-art icons are pure render functions so calling them as functions is
 * safe and avoids both the `react-hooks/static-components` lint rule and the
 * `createElement` overload mismatch with `IconComponent`.
 */
export function DataGridHeaderCell({
  field,
  isPrimary = false,
  sortDir = null,
  sticky,
  stickyStyle,
  onClickHeader,
  onResizeStart,
}: DataGridHeaderCellProps): ReactElement {
  const sortedAttr = sortDir == null ? undefined : sortDir
  return (
    <button
      type="button"
      role="columnheader"
      className={styles.headerCell}
      data-primary={isPrimary || undefined}
      data-sticky={sticky}
      data-sorted={sortedAttr}
      style={stickyStyle}
      aria-label={field.label}
      aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
      onClick={() => onClickHeader?.(field.id)}
    >
      <span className={styles.headerIcon} aria-hidden="true">
        {getFieldIcon(field.type)({ size: 11 })}
      </span>
      <span className={styles.headerLabel}>{field.label}</span>
      {field.required && (
        <span className={styles.requiredIndicator} aria-hidden="true" title="Required">
          *
        </span>
      )}
      <span className={styles.headerSort} aria-hidden="true">
        <ArrowDownIcon size={10} />
      </span>
      {onResizeStart && (
        <span
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          onMouseDown={(e) => {
            // Stop the click from also toggling the column sort.
            e.stopPropagation()
            e.preventDefault()
            onResizeStart(e)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </button>
  )
}
