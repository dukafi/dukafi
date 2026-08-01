/**
 * DataGridHeaderRow — the grid's column-header row: a leading select-all
 * checkbox, one `DataGridHeaderCell` per ordered field, and a trailing
 * (label-less) actions column header.
 */
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { Checkbox } from '@ui/components/Checkbox'
import type { DataField } from '@core/data/schemas'
import { DataGridHeaderCell } from './DataGridHeaderCell'
import type { SortState } from './dataGridRows'
import styles from './DataGrid.module.css'

interface DataGridHeaderRowProps {
  fields: DataField[]
  primaryFieldId: string
  sort: SortState | null
  /** Header checkbox is checked when any visible row is selected. */
  headerChecked: boolean
  allChecked: boolean
  onToggleAll: (next: boolean) => void
  onSort: (fieldId: string) => void
  primaryStickyLeft: CSSProperties
  checkboxStickyLeft: CSSProperties
  onPrimaryResizeStart: (e: ReactMouseEvent) => void
}

export function DataGridHeaderRow({
  fields,
  primaryFieldId,
  sort,
  headerChecked,
  allChecked,
  onToggleAll,
  onSort,
  primaryStickyLeft,
  checkboxStickyLeft,
  onPrimaryResizeStart,
}: DataGridHeaderRowProps): ReactElement {
  return (
    <div role="row" className={styles.headerRow}>
      {/* Leading checkbox column header */}
      <div
        role="columnheader"
        className={styles.headerCell}
        data-sticky="checkbox"
        style={checkboxStickyLeft}
        aria-label="Select all rows"
      >
        <Checkbox
          boxSize="sm"
          checked={headerChecked}
          onCheckedChange={() => onToggleAll(!allChecked)}
          aria-label={allChecked ? 'Deselect all rows' : 'Select all rows'}
        />
      </div>

      {fields.map((field) => {
        const isPrimary = field.id === primaryFieldId
        const sortDir = sort?.fieldId === field.id ? sort.dir : null
        return (
          <DataGridHeaderCell
            key={field.id}
            field={field}
            isPrimary={isPrimary}
            sortDir={sortDir}
            sticky={isPrimary ? 'primary' : undefined}
            stickyStyle={isPrimary ? primaryStickyLeft : undefined}
            onClickHeader={() => onSort(field.id)}
            onResizeStart={isPrimary ? onPrimaryResizeStart : undefined}
          />
        )
      })}

      {/* Trailing actions column header — no visible label */}
      <div role="columnheader" className={styles.headerCell} aria-label="Actions" />
    </div>
  )
}
