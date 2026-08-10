/**
 * Commerce → Collections.
 *
 * Same table + pagination + dialogs shape as Products. Ordered product
 * membership — the order a `store.relationship-loop` module walks when it
 * renders the collection on the storefront (see
 * `docs/architecture/publishing.md`) — lives in its own `MembershipDialog`,
 * not inline.
 */
import { useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { SearchBar } from '@ui/components/SearchBar'
import { Select } from '@ui/components/Select'
import { getErrorMessage } from '@core/utils/errorMessage'
import { ArrowDownIcon } from 'pixel-art-icons/icons/arrow-down'
import { ArrowUpIcon } from 'pixel-art-icons/icons/arrow-up'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { ListBoxSolidIcon } from 'pixel-art-icons/icons/list-box-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { commerceApi } from '../api'
import { Pagination } from '../components/Pagination'
import { RowActionMenu } from '../components/RowActionMenu'
import type { CommerceData } from '../hooks/useCommerceData'
import type { Collection, Product } from '../types'
import styles from '../CommercePage.module.css'

export function CollectionsSection({ data }: { data: CommerceData }) {
  const { collections, products, error, setError, refresh } = data
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [membershipCollection, setMembershipCollection] = useState<Collection | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<Collection | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = query.trim()
    ? collections.filter((collection) => {
      const q = query.trim().toLowerCase()
      return collection.title.toLowerCase().includes(q) || collection.slug.toLowerCase().includes(q)
    })
    : collections
  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const clampedPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  function openCreate() {
    setEditingCollection(null)
    setDialogMode('create')
  }

  function openEdit(collection: Collection) {
    setEditingCollection(collection)
    setDialogMode('edit')
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingCollection(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = {
      title: String(form.get('title') || ''),
      slug: String(form.get('slug') || ''),
      description: String(form.get('description') || ''),
      sortOrder: Number(form.get('sortOrder') || 0),
    }
    setBusy(true)
    setError(null)
    try {
      if (dialogMode === 'create') {
        await commerceApi.createCollection(input)
      } else if (editingCollection) {
        await commerceApi.updateCollection(editingCollection.id, input)
      }
      await refresh()
      closeDialog()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save collection'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(collection: Collection) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.deleteCollection(collection.id)
      setRemoveCandidate(null)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete collection'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <SearchBar value={query} onValueChange={(value) => { setQuery(value); setPage(1) }} placeholder="Search collections…" aria-label="Search collections" />
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New collection</span>
        </Button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {pageItems.length === 0 ? (
        <EmptyState
          title={collections.length === 0 ? 'No collections yet.' : 'No collections match your search.'}
          description={collections.length === 0 ? 'Group products into a collection to feature them on the storefront.' : undefined}
        />
      ) : (
        <DataTable aria-label="Collections" density="compact">
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader scope="col">Title</DataTableHeader>
              <DataTableHeader scope="col">Slug</DataTableHeader>
              <DataTableHeader scope="col">Products</DataTableHeader>
              <DataTableHeader scope="col">Sort order</DataTableHeader>
              <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {pageItems.map((collection) => (
              <DataTableRow key={collection.id} aria-label={`Collection ${collection.title}`}>
                <DataTableCell><strong>{collection.title || 'Untitled collection'}</strong></DataTableCell>
                <DataTableCell>{collection.slug}</DataTableCell>
                <DataTableCell>{collection.productIds.length}</DataTableCell>
                <DataTableCell>{collection.sortOrder}</DataTableCell>
                <DataTableCell className={styles.actionsCell}>
                  <RowActionMenu
                    triggerLabel={`Actions for ${collection.title}`}
                    menuLabel={`Collection actions for ${collection.title}`}
                    items={[
                      { label: 'Edit', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => openEdit(collection) },
                      { label: 'Manage products', icon: <ListBoxSolidIcon size={12} aria-hidden="true" />, onSelect: () => setMembershipCollection(collection) },
                      { label: 'Delete', icon: <TrashSolidIcon size={12} aria-hidden="true" />, danger: true, onSelect: () => setRemoveCandidate(collection) },
                    ]}
                  />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <Pagination
        page={clampedPage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />

      {dialogMode && (
        <CollectionDialog
          mode={dialogMode}
          collection={editingCollection}
          busy={busy}
          onSave={handleSave}
          onClose={closeDialog}
        />
      )}

      {membershipCollection && (
        <MembershipDialog
          collection={collections.find((collection) => collection.id === membershipCollection.id) ?? membershipCollection}
          products={products}
          refresh={refresh}
          onClose={() => setMembershipCollection(null)}
        />
      )}

      <Dialog
        open={removeCandidate !== null}
        onClose={() => setRemoveCandidate(null)}
        title="Delete collection?"
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveCandidate(null)} disabled={busy}>
              <span>Cancel</span>
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => removeCandidate && void handleDelete(removeCandidate)}>
              <TrashSolidIcon size={13} aria-hidden="true" />
              <span>Delete collection</span>
            </Button>
          </>
        }
      >
        <p>
          This permanently deletes “{removeCandidate?.title}”. Its member products are unaffected, but the collection page
          stops being generated.
        </p>
      </Dialog>
    </div>
  )
}

const COLLECTION_FORM_ID = 'commerce-collection-form'

function CollectionDialog({
  mode,
  collection,
  busy,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  collection: Collection | null
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'create' ? 'New collection' : 'Edit collection'}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            <span>Cancel</span>
          </Button>
          <Button type="submit" form={COLLECTION_FORM_ID} variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>{mode === 'create' ? 'Create this collection' : 'Save collection'}</span>
          </Button>
        </>
      }
    >
      <form id={COLLECTION_FORM_ID} className={styles.dialogForm} onSubmit={onSave}>
        <FormField label="Title" htmlFor="collection-title">
          <Input id="collection-title" name="title" required defaultValue={collection?.title} />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="collection-slug"
          description={collection
            ? 'The collection\u2019s URL. Changing it leaves a redirect behind.'
            : 'Leave blank to generate one from the title.'}
        >
          <Input
            id="collection-slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder={collection ? undefined : 'auto'}
            defaultValue={collection?.slug}
            monospace
          />
        </FormField>
        <FormField label="Description" htmlFor="collection-description">
          <Input id="collection-description" name="description" defaultValue={collection?.description} />
        </FormField>
        <FormField label="Sort order" htmlFor="collection-sort-order">
          <Input id="collection-sort-order" name="sortOrder" type="number" min={0} defaultValue={collection?.sortOrder ?? 0} />
        </FormField>
      </form>
    </Dialog>
  )
}

function MembershipDialog({
  collection,
  products,
  refresh,
  onClose,
}: {
  collection: Collection
  products: Product[]
  refresh: () => Promise<void>
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const memberIds = collection.productIds
  const members = memberIds.map((id) => products.find((product) => product.id === id)).filter((p): p is Product => Boolean(p))
  const availableProducts = products.filter((product) => !memberIds.includes(product.id))

  async function setMembers(ids: number[]) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.setCollectionMembers(collection.id, ids)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update collection membership'))
    } finally {
      setBusy(false)
    }
  }

  function move(index: number, direction: -1 | 1) {
    const ids = [...memberIds]
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void setMembers(ids)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Products — ${collection.title}`}
      size="md"
      footer={<Button type="button" variant="secondary" size="sm" onClick={onClose}><span>Close</span></Button>}
    >
      {error && <p className={styles.error} role="alert">{error}</p>}
      {members.length === 0 ? (
        <p className={styles.emptyInline}>No products in this collection yet.</p>
      ) : (
        <ul className={styles.memberList}>
          {members.map((product, index) => (
            <li key={product.id} className={styles.memberRow}>
              <span className={styles.identityLabel}>{product.title}</span>
              <Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Move ${product.title} up`} disabled={index === 0 || busy} onClick={() => move(index, -1)}>
                <ArrowUpIcon size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Move ${product.title} down`} disabled={index === members.length - 1 || busy} onClick={() => move(index, 1)}>
                <ArrowDownIcon size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" tone="danger" size="xs" iconOnly aria-label={`Remove ${product.title}`} disabled={busy} onClick={() => void setMembers(memberIds.filter((id) => id !== product.id))}>
                <TrashSolidIcon size={12} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {availableProducts.length > 0 && (
        <Select
          aria-label="Add product to collection"
          placeholder="Add a product…"
          value=""
          disabled={busy}
          options={availableProducts.map((product) => ({ value: String(product.id), label: product.title, textValue: product.title }))}
          onChange={(event) => void setMembers([...memberIds, Number(event.currentTarget.value)])}
        />
      )}
    </Dialog>
  )
}
