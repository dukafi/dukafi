import { listCmsDataTables } from '@core/persistence/cmsData'
import { useAsyncResource } from '@admin/lib/useAsyncResource'
import type { ControlProps } from './shared'
import { Select } from '@ui/components/Select'
import { ControlRow } from '@ui/components/ControlRow'
import styles from './controls.module.css'

interface DataTableControlProps extends ControlProps<string> {
  includeSystem?: boolean
}

interface TableOption {
  id: string
  label: string
  kind: string
}

export function DataTableControl({
  propKey,
  value,
  onChange,
  label,
  isOverride,
  disabled,
  layout,
  includeSystem = false,
}: DataTableControlProps) {
  const {
    data: tables,
    loading,
    error,
  } = useAsyncResource<TableOption[]>(
    async () => {
      const items = await listCmsDataTables()
      return items
        .filter((table) => includeSystem || table.kind === 'data')
        .map((table) => ({
          id: table.id,
          label: table.name || table.slug || table.id,
          kind: table.kind,
        }))
    },
    [includeSystem],
    { fallbackError: 'Failed to load data tables.' },
  )

  return (
    <ControlRow
      propKey={propKey}
      label={label}
      layout={layout}
      isOverride={isOverride}
      disabled={disabled}
    >
      <div className={styles.dataTableControl}>
        <Select
          id={`ctrl-${propKey}`}
          value={value ?? ''}
          disabled={disabled || loading}
          fieldSize="sm"
          placeholder={loading ? 'Loading tables...' : 'Choose table'}
          onChange={(event) => onChange(propKey, event.target.value)}
        >
          <option value="">
            {loading ? 'Loading tables...' : 'Choose table'}
          </option>
          {(tables ?? []).map((table) => (
            <option key={table.id} value={table.id}>
              {table.label}
            </option>
          ))}
        </Select>
        {error && (
          <div className={styles.controlError} role="alert">
            {error}
          </div>
        )}
      </div>
    </ControlRow>
  )
}
