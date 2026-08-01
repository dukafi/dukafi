/**
 * FieldSchemaCell — cell renderer for `fieldSchema` fields.
 *
 * A `fieldSchema` cell stores a `DataField[]` array — the parameter schema
 * for a visual component row. The cell renders a button showing the current
 * param count. The parent wires `onOpenFieldEditor` to open the field-picker
 * dialog (the same UI used when adding columns to a data table).
 *
 * The optional `onOpenFieldEditor` prop follows the same extra-prop threading
 * pattern that `RelationCell` uses for `onOpenPicker`.
 */
import type { ReactElement } from 'react'
import { Button } from '@ui/components/Button'
import { BracesIcon } from 'pixel-art-icons/icons/braces'
import type { CellEditorProps } from '@admin/pages/data/types'
import type { DataField } from '@core/data/schemas'
import { readFieldSchemaCell } from '@core/data/cells'
import styles from './cells.module.css'

type FieldSchemaField = Extract<DataField, { type: 'fieldSchema' }>

export interface FieldSchemaCellProps extends CellEditorProps<FieldSchemaField> {
  /** Called when the user wants to open the field-editor dialog. */
  onOpenFieldEditor?: () => void
}

export function FieldSchemaCell({
  field,
  value,
  readOnly,
  ariaLabel,
  onOpenFieldEditor,
}: FieldSchemaCellProps): ReactElement {
  const params = readFieldSchemaCell({ [field.id]: value }, field.id)
  const count = params.length
  const label = count === 1 ? '1 param' : `${count} params`

  return (
    <div className={styles.relationButton}>
      <Button
        variant="secondary"
        size="sm"
        disabled={readOnly || !onOpenFieldEditor}
        aria-label={ariaLabel ?? `${field.label}: Edit ${label}`}
        onClick={() => onOpenFieldEditor?.()}
        align="start"
        fullWidth
      >
        <BracesIcon size={14} />
        <span>Edit {label}</span>
      </Button>
    </div>
  )
}
