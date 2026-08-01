/**
 * Commerce → Collections.
 *
 * Same master-detail shape as Products. The detail canvas adds an ordered
 * product-membership list — the same order a `store.collection-loop` module
 * walks when it renders the collection on the storefront (see
 * `docs/architecture/publishing.md`).
 */
import { useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { Input } from '@ui/components/Input'
import { SearchBar } from '@ui/components/SearchBar'
import { Select } from '@ui/components/Select'
import { getErrorMessage } from '@core/utils/errorMessage'
import { ArrowDownIcon } from 'pixel-art-icons/icons/arrow-down'
import { ArrowUpIcon } from 'pixel-art-icons/icons/arrow-up'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { commerceApi } from '../api'
import type { CommerceData } from '../hooks/useCommerceData'
import type { Collection, Product } from '../types'
import styles from '../CommercePage.module.css'

export function CollectionsSection({ data }: { data: CommerceData }) {
  const { collections, products, error, setError, refresh } = data
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<Collection | null>(null)

  const selected = selectedId === 'new' || selectedId === null
    ? null
    : collections.find((collection) => collection.id === selectedId) ?? null
  const creating = selectedId === 'new'

  const filtered = query.trim()
    ? collections.filter((collection) => {
      const q = query.trim().toLowerCase()
      return collection.title.toLowerCase().includes(q) || collection.slug.toLowerCase().includes(q)
    })
    : collections

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
      const result = creating
        ? await commerceApi.createCollection(input)
        : await commerceApi.updateCollection((selected as Collection).id, input)
      await refresh()
      setSelectedId(result.collection.id)
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
      setSelectedId(null)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete collection'))
    } finally {
      setBusy(false)
    }
  }

  async function setMembers(collection: Collection, productIds: number[]) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.setCollectionMembers(collection.id, productIds)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update collection membership'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.settingsWorkspace}>
      <div className={styles.settingsBrowser}>
        <div className={styles.settingsBrowserHeader}>
          <h2>Collections</h2>
          <Button type="button" variant="primary" size="sm" onClick={() => setSelectedId('new')}>
            <PlusIcon size={14} aria-hidden="true" />
            <span>New collection</span>
          </Button>
        </div>
        <SearchBar value={query} onValueChange={setQuery} placeholder="Search collections…" aria-label="Search collections" />
        {error && <p className={styles.settingsBrowserError} role="alert">{error}</p>}
        <div className={styles.settingsList} role="listbox" aria-label="Collections">
          {filtered.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className={styles.settingsListItem}
              data-active={selectedId === collection.id ? 'true' : undefined}
              onClick={() => setSelectedId(collection.id)}
            >
              <span className={styles.settingsItemIcon}><BoxStackSolidIcon size={16} aria-hidden="true" /></span>
              <span className={styles.settingsListIdentity}>
                <span className={styles.settingsListLabel}>{collection.title || 'Untitled collection'}</span>
                <span className={styles.settingsListMeta}>
                  {collection.slug} · {collection.productIds.length} product{collection.productIds.length === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              compact
              title={collections.length === 0 ? 'No collections yet.' : 'No collections match your search.'}
              description={collections.length === 0 ? 'Group products into a collection to feature them on the storefront.' : undefined}
            />
          )}
        </div>
      </div>

      <div className={styles.settingsDetailCanvas}>
        {selected || creating ? (
          <CollectionDetail
            key={creating ? 'new' : (selected as Collection).id}
            collection={creating ? null : (selected as Collection)}
            products={products}
            busy={busy}
            onSave={handleSave}
            onRequestDelete={() => selected && setRemoveCandidate(selected)}
            onSetMembers={(ids) => selected && void setMembers(selected, ids)}
          />
        ) : (
          <EmptyState
            variant="centered"
            icon={<BoxStackSolidIcon size={22} aria-hidden="true" />}
            title="Select a collection"
            description="Choose a collection from the list, or create a new one."
          />
        )}
      </div>

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

function CollectionDetail({
  collection,
  products,
  busy,
  onSave,
  onRequestDelete,
  onSetMembers,
}: {
  collection: Collection | null
  products: Product[]
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onRequestDelete: () => void
  onSetMembers: (productIds: number[]) => void
}) {
  const memberIds = collection?.productIds ?? []
  const members = memberIds.map((id) => products.find((product) => product.id === id)).filter((p): p is Product => Boolean(p))
  const availableProducts = products.filter((product) => !memberIds.includes(product.id))

  function move(index: number, direction: -1 | 1) {
    const next = [...memberIds]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onSetMembers(next)
  }

  return (
    <div className={styles.settingsDetail}>
      <div className={styles.settingsDetailHeader}>
        <span className={styles.settingsHeroIcon}><BoxStackSolidIcon size={28} aria-hidden="true" /></span>
        <div className={styles.settingsDetailIdentity}>
          <h2>{collection ? collection.title || 'Untitled collection' : 'New collection'}</h2>
          <p>{collection ? `/collections/${collection.slug}` : 'Fill in the details, then add products.'}</p>
        </div>
      </div>

      <form className={styles.detailSection} onSubmit={onSave}>
        <div className={styles.settingsFormRow}>
          <label htmlFor="collection-title">Title</label>
          <div>
            <Input id="collection-title" name="title" required defaultValue={collection?.title} />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="collection-slug">Slug</label>
          <div>
            <Input
              id="collection-slug"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={collection?.slug}
              monospace
            />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="collection-description">Description</label>
          <div>
            <Input id="collection-description" name="description" defaultValue={collection?.description} />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="collection-sort-order">Sort order</label>
          <div>
            <Input id="collection-sort-order" name="sortOrder" type="number" min={0} defaultValue={collection?.sortOrder ?? 0} />
          </div>
        </div>
        <div className={styles.settingsDetailActions}>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>Save collection</span>
          </Button>
        </div>
      </form>

      {collection && (
        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <h3>Products</h3>
          </div>
          {members.length === 0 ? (
            <p className={styles.detailEmpty}>No products in this collection yet.</p>
          ) : (
            <ul className={styles.memberList}>
              {members.map((product, index) => (
                <li key={product.id} className={styles.memberRow}>
                  <span className={styles.settingsItemIcon}><PackageSolidIcon size={14} aria-hidden="true" /></span>
                  <span className={styles.settingsListLabel}>{product.title}</span>
                  <Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Move ${product.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpIcon size={12} aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Move ${product.title} down`} disabled={index === members.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDownIcon size={12} aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" tone="danger" size="xs" iconOnly aria-label={`Remove ${product.title}`} onClick={() => onSetMembers(memberIds.filter((id) => id !== product.id))}>
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
              options={availableProducts.map((product) => ({ value: String(product.id), label: product.title, textValue: product.title }))}
              onChange={(event) => onSetMembers([...memberIds, Number(event.currentTarget.value)])}
            />
          )}
        </div>
      )}

      {collection && (
        <div className={styles.detailSection}>
          <div className={styles.credentialDangerZone}>
            <Button type="button" variant="ghost" tone="danger" size="sm" onClick={onRequestDelete}>
              <TrashSolidIcon size={14} aria-hidden="true" />
              <span>Delete collection</span>
            </Button>
            <p>This permanently deletes the collection. Member products are unaffected.</p>
          </div>
        </div>
      )}
    </div>
  )
}
