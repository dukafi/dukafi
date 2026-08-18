/**
 * Dashboard → Tables.
 *
 * Merchant-defined rows that are not products — a team, a FAQ, a lookbook.
 * Columns are invented here; Site loops the table as `data/<slug>` and bakes
 * the rows into static HTML, the same way a product grid bakes the catalogue.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { MediaPickerModal } from '@admin/pages/media/components/MediaPickerModal/MediaPickerModal'
import { SearchBar } from '@ui/components/SearchBar'
import { Select } from '@ui/components/Select'
import { getErrorMessage } from '@core/utils/errorMessage'
import { ArrowLeftIcon } from 'pixel-art-icons/icons/arrow-left'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { ImageSolidIcon } from 'pixel-art-icons/icons/image-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { commerceApi } from '../api'
import { RowActionMenu } from '../components/RowActionMenu'
import type { DataColumn, DataColumnType, DataRow, DataTable as CustomDataTable } from '../types'
import styles from '../DashboardPage.module.css'

const COLUMN_TYPES: Array<{ value: DataColumnType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'url', label: 'URL' },
  { value: 'media', label: 'Image' },
]

function emptyColumn(index: number): DataColumn {
  return { id: '', label: '', type: index === 2 ? 'media' : 'text' }
}

function cellPreview(column: DataColumn, row: DataRow): ReactNode {
  if (column.type === 'media') {
    const src = typeof row.entry?.[column.id] === 'string' ? String(row.entry[column.id]) : ''
    if (src) return <img src={src} alt="" className={styles.cellThumb} />
    return row.cells[column.id] ? 'Image' : '—'
  }
  const value = row.cells[column.id]
  if (value == null || value === '') return '—'
  if (column.type === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No'
  return String(value)
}

export function TablesSection() {
  const [tables, setTables] = useState<CustomDataTable[]>([])
  const [openTable, setOpenTable] = useState<CustomDataTable | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tableDialog, setTableDialog] = useState<'create' | 'edit' | null>(null)
  const [editingTable, setEditingTable] = useState<CustomDataTable | null>(null)
  const [rowDialog, setRowDialog] = useState<'create' | 'edit' | null>(null)
  const [editingRow, setEditingRow] = useState<DataRow | null>(null)
  const [removeTable, setRemoveTable] = useState<CustomDataTable | null>(null)
  const [removeRow, setRemoveRow] = useState<DataRow | null>(null)
  const [busy, setBusy] = useState(false)

  const loadTables = useCallback(async () => {
    try {
      setTables((await commerceApi.listDataTables()).tables)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load tables'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadTables() }, [loadTables])

  async function openRows(table: CustomDataTable) {
    try {
      const detailed = (await commerceApi.getDataTable(table.id)).table
      setOpenTable(detailed)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load rows'))
    }
  }

  async function refreshOpenTable() {
    if (!openTable) {
      await loadTables()
      return
    }
    const detailed = (await commerceApi.getDataTable(openTable.id)).table
    setOpenTable(detailed)
    await loadTables()
  }

  const filtered = query.trim()
    ? tables.filter((table) => {
      const q = query.trim().toLowerCase()
      return table.name.toLowerCase().includes(q) || table.slug.toLowerCase().includes(q)
    })
    : tables

  if (openTable) {
    const rows = openTable.rows ?? []
    return (
      <section className={styles.section} aria-labelledby="tables-title">
        <div className={styles.toolbar}>
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setOpenTable(null); void loadTables() }}>
              <ArrowLeftIcon size={14} aria-hidden="true" />
              <span>Tables</span>
            </Button>
            <h2 id="tables-title">{openTable.name}</h2>
          </div>
          <Button type="button" variant="primary" size="sm" onClick={() => { setEditingRow(null); setRowDialog('create') }}>
            <PlusIcon size={14} aria-hidden="true" />
            <span>New row</span>
          </Button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {rows.length === 0 ? (
          <EmptyState
            title="No rows yet"
            description="Add people, cards, or whatever this table is for. A Site loop over this table will bake them into the published page."
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableRow>
                {openTable.columns.map((column) => (
                  <DataTableHeader key={column.id}>{column.label}</DataTableHeader>
                ))}
                <DataTableHeader>Slug</DataTableHeader>
                <DataTableHeader> </DataTableHeader>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {rows.map((row) => (
                <DataTableRow key={row.id}>
                  {openTable.columns.map((column) => (
                    <DataTableCell key={column.id}>{cellPreview(column, row)}</DataTableCell>
                  ))}
                  <DataTableCell>{row.slug}</DataTableCell>
                  <DataTableCell>
                    <RowActionMenu items={[
                      { label: 'Edit', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => { setEditingRow(row); setRowDialog('edit') } },
                      { label: 'Delete', icon: <TrashSolidIcon size={12} aria-hidden="true" />, danger: true, onSelect: () => setRemoveRow(row) },
                    ]}
                    />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
        {rowDialog && (
          <RowDialog
            table={openTable}
            row={rowDialog === 'edit' ? editingRow : null}
            busy={busy}
            onClose={() => { setRowDialog(null); setEditingRow(null) }}
            onSave={async (input) => {
              setBusy(true)
              setError(null)
              try {
                if (rowDialog === 'create') await commerceApi.createDataRow(openTable.id, input)
                else if (editingRow) await commerceApi.updateDataRow(openTable.id, editingRow.id, input)
                await refreshOpenTable()
                setRowDialog(null)
                setEditingRow(null)
              } catch (err) {
                setError(getErrorMessage(err, 'Could not save row'))
              } finally {
                setBusy(false)
              }
            }}
          />
        )}
        {removeRow && (
          <Dialog
            open
            tone="danger"
            title={`Delete ${removeRow.slug}?`}
            onClose={() => setRemoveRow(null)}
            footer={(
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveRow(null)}>Cancel</Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await commerceApi.deleteDataRow(openTable.id, removeRow.id)
                      await refreshOpenTable()
                      setRemoveRow(null)
                    } catch (err) {
                      setError(getErrorMessage(err, 'Could not delete row'))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          >
            <p>Pages looping this table will re-bake without this row.</p>
          </Dialog>
        )}
      </section>
    )
  }

  return (
    <section className={styles.section} aria-labelledby="tables-title">
      <div className={styles.toolbar}>
        <SearchBar value={query} onValueChange={setQuery} placeholder="Search tables" aria-label="Search tables" />
        <Button type="button" variant="primary" size="sm" onClick={() => { setEditingTable(null); setTableDialog('create') }}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New table</span>
        </Button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? null : filtered.length === 0 ? (
        <EmptyState
          title="No tables yet"
          description="Create a table with columns — name, image, title — then loop it on a page. Published pages stay static HTML."
        />
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>Name</DataTableHeader>
              <DataTableHeader>Slug</DataTableHeader>
              <DataTableHeader>Columns</DataTableHeader>
              <DataTableHeader>Rows</DataTableHeader>
              <DataTableHeader> </DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {filtered.map((table) => (
              <DataTableRow key={table.id}>
                <DataTableCell>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void openRows(table)}>{table.name}</Button>
                </DataTableCell>
                <DataTableCell>{table.slug}</DataTableCell>
                <DataTableCell>{table.columns.map((column) => column.label).join(', ') || '—'}</DataTableCell>
                <DataTableCell>{table.rowCount}</DataTableCell>
                <DataTableCell>
                  <RowActionMenu items={[
                    { label: 'Open rows', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => void openRows(table) },
                    { label: 'Edit columns', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => { setEditingTable(table); setTableDialog('edit') } },
                    { label: 'Delete', icon: <TrashSolidIcon size={12} aria-hidden="true" />, danger: true, onSelect: () => setRemoveTable(table) },
                  ]}
                  />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {tableDialog && (
        <TableDialog
          table={tableDialog === 'edit' ? editingTable : null}
          busy={busy}
          onClose={() => { setTableDialog(null); setEditingTable(null) }}
          onSave={async (input) => {
            setBusy(true)
            setError(null)
            try {
              if (tableDialog === 'create') await commerceApi.createDataTable(input)
              else if (editingTable) await commerceApi.updateDataTable(editingTable.id, input)
              await loadTables()
              setTableDialog(null)
              setEditingTable(null)
            } catch (err) {
              setError(getErrorMessage(err, 'Could not save table'))
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
      {removeTable && (
        <Dialog
          open
          tone="danger"
          title={`Delete ${removeTable.name}?`}
          onClose={() => setRemoveTable(null)}
          footer={(
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveTable(null)}>Cancel</Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await commerceApi.deleteDataTable(removeTable.id)
                    await loadTables()
                    setRemoveTable(null)
                  } catch (err) {
                    setError(getErrorMessage(err, 'Could not delete table'))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Delete table
              </Button>
            </>
          )}
        >
          <p>Every row in this table is removed. Pages that looped it re-bake empty.</p>
        </Dialog>
      )}
    </section>
  )
}

function TableDialog({
  table,
  busy,
  onClose,
  onSave,
}: {
  table: CustomDataTable | null
  busy: boolean
  onClose: () => void
  onSave: (input: { name: string; slug: string; columns: DataColumn[] }) => Promise<void>
}) {
  const [columns, setColumns] = useState<DataColumn[]>(
    table?.columns.length
      ? table.columns.map((column) => ({ ...column }))
      : [{ id: 'name', label: 'Name', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }, { id: 'image', label: 'Image', type: 'media' }],
  )

  function updateColumn(index: number, patch: Partial<DataColumn>) {
    setColumns((current) => current.map((column, i) => i === index ? { ...column, ...patch } : column))
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await onSave({
      name: String(form.get('name') || ''),
      slug: String(form.get('slug') || ''),
      columns: columns.map((column, index) => ({
        id: column.id.trim(),
        label: column.label.trim() || column.id.trim() || `Column ${index + 1}`,
        type: column.type,
      })),
    })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={table ? `Edit ${table.name}` : 'New table'}
      size="xl"
      footer={(
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="data-table-form" variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>Save</span>
          </Button>
        </>
      )}
    >
      <form id="data-table-form" onSubmit={(event) => void handleSave(event)}>
        <FormField label="Name" htmlFor="table-name">
          <Input id="table-name" name="name" required defaultValue={table?.name} placeholder="Team" />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="table-slug"
          description="Used on the page loop as data/team. Leave blank to generate one."
        >
          <Input
            id="table-slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder={table ? undefined : 'team'}
            defaultValue={table?.slug}
            monospace
          />
        </FormField>
        <p className={styles.emptyInline}>Columns become bindable fields inside a loop — name, image, title.</p>
        <ul className={styles.memberList}>
          {columns.map((column, index) => (
            <li key={index} className={styles.memberRow}>
              <div className={styles.columnFields}>
                <FormField label="Id" htmlFor={`column-id-${index}`}>
                  <Input
                    id={`column-id-${index}`}
                    value={column.id}
                    monospace
                    placeholder="name"
                    onChange={(event) => updateColumn(index, { id: event.currentTarget.value })}
                  />
                </FormField>
                <FormField label="Label" htmlFor={`column-label-${index}`}>
                  <Input
                    id={`column-label-${index}`}
                    value={column.label}
                    placeholder="Name"
                    onChange={(event) => updateColumn(index, { label: event.currentTarget.value })}
                  />
                </FormField>
                <FormField label="Type" htmlFor={`column-type-${index}`}>
                  <Select
                    id={`column-type-${index}`}
                    value={column.type}
                    options={COLUMN_TYPES.map((option) => ({ ...option, textValue: option.label }))}
                    onChange={(event) => updateColumn(index, { type: event.currentTarget.value as DataColumnType })}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  iconOnly
                  aria-label="Remove column"
                  disabled={columns.length < 2}
                  onClick={() => setColumns((current) => current.filter((_, i) => i !== index))}
                >
                  <TrashSolidIcon size={12} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" onClick={() => setColumns((current) => [...current, emptyColumn(current.length)])}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>Add column</span>
        </Button>
      </form>
    </Dialog>
  )
}

function RowDialog({
  table,
  row,
  busy,
  onClose,
  onSave,
}: {
  table: CustomDataTable
  row: DataRow | null
  busy: boolean
  onClose: () => void
  onSave: (input: { slug?: string; cells: Record<string, unknown> }) => Promise<void>
}) {
  const [cells, setCells] = useState<Record<string, unknown>>(() => ({ ...(row?.cells ?? {}) }))
  const [mediaColumn, setMediaColumn] = useState<string | null>(null)

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await onSave({
      slug: String(form.get('slug') || ''),
      cells,
    })
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={row ? `Edit ${row.slug}` : `New ${table.name} row`}
        size="lg"
        footer={(
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="data-row-form" variant="primary" size="sm" disabled={busy}>
              <SaveSolidIcon size={14} aria-hidden="true" />
              <span>Save</span>
            </Button>
          </>
        )}
      >
        <form id="data-row-form" onSubmit={(event) => void handleSave(event)}>
          <FormField label="Slug" htmlFor="row-slug" description="Leave blank to generate one from the first text column.">
            <Input id="row-slug" name="slug" defaultValue={row?.slug} monospace placeholder="auto" />
          </FormField>
          {table.columns.map((column) => (
            <ColumnField
              key={column.id}
              column={column}
              value={cells[column.id]}
              onChange={(value) => setCells((current) => ({ ...current, [column.id]: value }))}
              onPickMedia={() => setMediaColumn(column.id)}
            />
          ))}
        </form>
      </Dialog>
      {mediaColumn && (
        <MediaPickerModal
          open
          mediaKind="image"
          currentValue={cells[mediaColumn] == null ? null : String(cells[mediaColumn])}
          onClose={() => setMediaColumn(null)}
          onPick={(asset) => {
            setCells((current) => ({ ...current, [mediaColumn]: Number(asset.id) || asset.id }))
            setMediaColumn(null)
          }}
        />
      )}
    </>
  )
}

function ColumnField({
  column,
  value,
  onChange,
  onPickMedia,
}: {
  column: DataColumn
  value: unknown
  onChange: (value: unknown) => void
  onPickMedia: () => void
}) {
  const id = `cell-${column.id}`
  if (column.type === 'boolean') {
    return (
      <FormField label={column.label} htmlFor={id}>
        <Checkbox
          id={id}
          checked={value === true || value === 'true'}
          onCheckedChange={onChange}
        />
      </FormField>
    )
  }
  if (column.type === 'media') {
    return (
      <FormField label={column.label} htmlFor={id}>
        <Button type="button" variant="secondary" size="sm" onClick={onPickMedia}>
          <ImageSolidIcon size={14} aria-hidden="true" />
          <span>{value ? 'Change image' : 'Choose image'}</span>
        </Button>
      </FormField>
    )
  }
  if (column.type === 'longText') {
    return (
      <FormField label={column.label} htmlFor={id}>
        <textarea
          id={id}
          className={styles.descriptionInput}
          rows={4}
          value={value == null ? '' : String(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </FormField>
    )
  }
  return (
    <FormField label={column.label} htmlFor={id}>
      <Input
        id={id}
        type={column.type === 'number' ? 'number' : column.type === 'url' ? 'url' : 'text'}
        value={value == null ? '' : String(value)}
        onChange={(event) => onChange(column.type === 'number' ? event.currentTarget.value : event.currentTarget.value)}
      />
    </FormField>
  )
}
