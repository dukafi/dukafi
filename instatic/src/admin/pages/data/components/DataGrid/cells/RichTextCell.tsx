import type { ReactElement } from 'react'
import { Textarea } from '@ui/components/Input'
import { readStringCell } from '@core/data/cells'
import type { CellEditorProps } from '@admin/pages/data/types'
import type { DataField } from '@core/data/schemas'
import styles from './cells.module.css'

type RichTextField = Extract<DataField, { type: 'richText' }>

// TODO: Wire up `TiptapBodyEditor` for richText in detail context (follow-up task).
// For now this renders a monospace Textarea in detail context and a plain
// text preview in grid context — the data-grid surface doesn't yet have the
// integrations the Content workspace exposes (media picker, data tokens).

export function RichTextCell({
  field,
  value,
  onChange,
  onCommit,
  readOnly,
  context,
  ariaLabel,
}: CellEditorProps<RichTextField>): ReactElement {
  const strValue = typeof value === 'string' ? value : readStringCell({ [field.id]: value }, field.id)

  if (context === 'grid') {
    // Grid context: show a truncated plain-text read-only preview.
    const preview = strValue
      .replace(/<[^>]*>/g, '')
      .replace(/[#*_`~>-]+/g, '')
      .trim()

    return (
      <span className={styles.readOnlyText} aria-label={ariaLabel ?? field.label}>
        {preview || ''}
      </span>
    )
  }

  return (
    <Textarea
      className={styles.inputFull}
      value={strValue}
      readOnly={readOnly}
      monospace
      aria-label={ariaLabel ?? field.label}
      resize="vertical"
      rows={6}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
    />
  )
}
