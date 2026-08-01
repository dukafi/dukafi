/**
 * Commerce → Products.
 *
 * A nested master-detail layout (list on the left, detail canvas on the
 * right) matching the pattern established by the AI workspace's Providers
 * tab. Selecting a product loads its form into the detail canvas; "New
 * product" opens the same canvas with an empty draft. Variants are edited
 * inline in a table beneath the product form — each row keeps its own local
 * draft state and posts independently, so editing one variant's stock
 * doesn't require re-saving the whole product.
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
import { TagPill } from '@ui/components/TagPill'
import { getErrorMessage } from '@core/utils/errorMessage'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { commerceApi } from '../api'
import type { CommerceData } from '../hooks/useCommerceData'
import type { Product, Variant, VariantFormState } from '../types'
import { emptyVariantForm, variantFormFrom } from '../types'
import styles from '../CommercePage.module.css'

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', textValue: 'Draft' },
  { value: 'active', label: 'Active', textValue: 'Active' },
]

export function ProductsSection({ data }: { data: CommerceData }) {
  const { products, error, setError, refresh } = data
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<Product | null>(null)

  const selected = selectedId === 'new' || selectedId === null
    ? null
    : products.find((product) => product.id === selectedId) ?? null
  const creating = selectedId === 'new'

  const filtered = query.trim()
    ? products.filter((product) => {
      const q = query.trim().toLowerCase()
      return product.title.toLowerCase().includes(q) || product.slug.toLowerCase().includes(q)
    })
    : products

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = {
      title: String(form.get('title') || ''),
      slug: String(form.get('slug') || ''),
      vendor: String(form.get('vendor') || ''),
      status: String(form.get('status') || 'draft'),
      descriptionHtml: String(form.get('descriptionHtml') || ''),
    }
    setBusy(true)
    setError(null)
    try {
      const result = creating
        ? await commerceApi.createProduct(input)
        : await commerceApi.updateProduct((selected as Product).id, input)
      await refresh()
      setSelectedId(result.product.id)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save product'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(product: Product) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.deleteProduct(product.id)
      setRemoveCandidate(null)
      setSelectedId(null)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete product'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.settingsWorkspace}>
      <div className={styles.settingsBrowser}>
        <div className={styles.settingsBrowserHeader}>
          <h2>Products</h2>
          <Button type="button" variant="primary" size="sm" onClick={() => setSelectedId('new')}>
            <PlusIcon size={14} aria-hidden="true" />
            <span>New product</span>
          </Button>
        </div>
        <SearchBar value={query} onValueChange={setQuery} placeholder="Search products…" aria-label="Search products" />
        {error && <p className={styles.settingsBrowserError} role="alert">{error}</p>}
        <div className={styles.settingsList} role="listbox" aria-label="Products">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              className={styles.settingsListItem}
              data-active={selectedId === product.id ? 'true' : undefined}
              onClick={() => setSelectedId(product.id)}
            >
              <span className={styles.settingsItemIcon}><PackageSolidIcon size={16} aria-hidden="true" /></span>
              <span className={styles.settingsListIdentity}>
                <span className={styles.settingsListLabel}>{product.title || 'Untitled product'}</span>
                <span className={styles.settingsListMeta}>
                  {product.slug} · {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
                </span>
              </span>
              <TagPill label={product.status} muted={product.status === 'draft'} size="xs" />
            </button>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              compact
              title={products.length === 0 ? 'No products yet.' : 'No products match your search.'}
              description={products.length === 0 ? 'Create your first product to start selling.' : undefined}
            />
          )}
        </div>
      </div>

      <div className={styles.settingsDetailCanvas}>
        {selected || creating ? (
          <ProductDetail
            key={creating ? 'new' : (selected as Product).id}
            product={creating ? null : (selected as Product)}
            busy={busy}
            onSave={handleSave}
            onRequestDelete={() => selected && setRemoveCandidate(selected)}
            refresh={refresh}
          />
        ) : (
          <EmptyState
            variant="centered"
            icon={<PackageSolidIcon size={22} aria-hidden="true" />}
            title="Select a product"
            description="Choose a product from the list, or create a new one."
          />
        )}
      </div>

      <Dialog
        open={removeCandidate !== null}
        onClose={() => setRemoveCandidate(null)}
        title="Delete product?"
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveCandidate(null)} disabled={busy}>
              <span>Cancel</span>
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => removeCandidate && void handleDelete(removeCandidate)}>
              <TrashSolidIcon size={13} aria-hidden="true" />
              <span>Delete product</span>
            </Button>
          </>
        }
      >
        <p>
          This permanently deletes “{removeCandidate?.title}” and its {removeCandidate?.variants.length ?? 0} variant
          {removeCandidate?.variants.length === 1 ? '' : 's'}. Published pages that reference it are re-baked without it.
        </p>
      </Dialog>
    </div>
  )
}

function ProductDetail({
  product,
  busy,
  onSave,
  onRequestDelete,
  refresh,
}: {
  product: Product | null
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onRequestDelete: () => void
  refresh: () => Promise<void>
}) {
  return (
    <div className={styles.settingsDetail}>
      <div className={styles.settingsDetailHeader}>
        <span className={styles.settingsHeroIcon}><PackageSolidIcon size={28} aria-hidden="true" /></span>
        <div className={styles.settingsDetailIdentity}>
          <h2>{product ? product.title || 'Untitled product' : 'New product'}</h2>
          <p>{product ? `/products/${product.slug}` : 'Fill in the details, then add at least one variant.'}</p>
        </div>
      </div>

      <form className={styles.detailSection} onSubmit={onSave}>
        <div className={styles.settingsFormRow}>
          <label htmlFor="product-title">Title</label>
          <div>
            <Input id="product-title" name="title" required defaultValue={product?.title} />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="product-slug">Slug</label>
          <div>
            <Input
              id="product-slug"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={product?.slug}
              monospace
            />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="product-vendor">Vendor</label>
          <div>
            <Input id="product-vendor" name="vendor" defaultValue={product?.vendor} />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="product-status">Status</label>
          <div>
            <Select id="product-status" name="status" defaultValue={product?.status ?? 'draft'} options={STATUS_OPTIONS} />
          </div>
        </div>
        <div className={styles.settingsFormRow}>
          <label htmlFor="product-description">Description</label>
          <div>
            <FormField description="Sanitized semantic HTML, rendered on the product page.">
              <textarea
                id="product-description"
                name="descriptionHtml"
                className={styles.descriptionInput}
                rows={4}
                defaultValue={product?.descriptionHtml}
              />
            </FormField>
          </div>
        </div>
        <div className={styles.settingsDetailActions}>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>Save product</span>
          </Button>
        </div>
      </form>

      {product && (
        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <h3>Variants</h3>
          </div>
          <VariantsTable product={product} busy={busy} refresh={refresh} />
        </div>
      )}

      {product && (
        <div className={styles.detailSection}>
          <div className={styles.credentialDangerZone}>
            <Button type="button" variant="ghost" tone="danger" size="sm" onClick={onRequestDelete}>
              <TrashSolidIcon size={14} aria-hidden="true" />
              <span>Delete product</span>
            </Button>
            <p>This permanently deletes the product and all of its variants.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function VariantsTable({ product, busy, refresh }: { product: Product; busy: boolean; refresh: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [creatingRow, setCreatingRow] = useState(false)

  return (
    <div className={styles.variantsTable}>
      {error && <p className={styles.settingsBrowserError} role="alert">{error}</p>}
      <DataTable density="compact" aria-label={`Variants for ${product.title}`}>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader scope="col">SKU</DataTableHeader>
            <DataTableHeader scope="col">Title</DataTableHeader>
            <DataTableHeader scope="col">Price</DataTableHeader>
            <DataTableHeader scope="col">Stock</DataTableHeader>
            <DataTableHeader scope="col">Position</DataTableHeader>
            <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {product.variants.map((variant) => (
            <VariantRow key={variant.id} productId={product.id} variant={variant} onError={setError} refresh={refresh} />
          ))}
          {creatingRow ? (
            <VariantRow
              productId={product.id}
              variant={null}
              nextPosition={product.variants.length}
              onError={setError}
              onDone={() => setCreatingRow(false)}
              refresh={refresh}
            />
          ) : (
            <DataTableRow>
              <DataTableCell colSpan={6}>
                <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => setCreatingRow(true)}>
                  <PlusIcon size={12} aria-hidden="true" />
                  <span>Add variant</span>
                </Button>
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </div>
  )
}

function VariantRow({
  productId,
  variant,
  nextPosition,
  onError,
  onDone,
  refresh,
}: {
  productId: number
  variant: Variant | null
  nextPosition?: number
  onError: (message: string | null) => void
  onDone?: () => void
  refresh: () => Promise<void>
}) {
  const [form, setForm] = useState<VariantFormState>(
    variant ? variantFormFrom(variant) : { ...emptyVariantForm, position: String(nextPosition ?? 0) },
  )
  const [busy, setBusy] = useState(false)

  function update<K extends keyof VariantFormState>(key: K, value: VariantFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setBusy(true)
    onError(null)
    try {
      const input = {
        sku: form.sku,
        title: form.title,
        priceCents: Number(form.priceCents),
        stock: Number(form.stock),
        position: Number(form.position),
      }
      if (variant) {
        await commerceApi.updateVariant(productId, variant.id, input)
      } else {
        await commerceApi.createVariant(productId, input)
        setForm({ ...emptyVariantForm, position: String((nextPosition ?? 0) + 1) })
        onDone?.()
      }
      await refresh()
    } catch (err) {
      onError(getErrorMessage(err, 'Could not save variant'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!variant) return
    setBusy(true)
    onError(null)
    try {
      await commerceApi.deleteVariant(productId, variant.id)
      await refresh()
    } catch (err) {
      onError(getErrorMessage(err, 'Could not delete variant'))
      setBusy(false)
    }
  }

  return (
    <DataTableRow>
      <DataTableCell><Input aria-label="SKU" value={form.sku} required monospace fieldSize="sm" onChange={(e) => update('sku', e.currentTarget.value)} /></DataTableCell>
      <DataTableCell><Input aria-label="Title" value={form.title} required fieldSize="sm" onChange={(e) => update('title', e.currentTarget.value)} /></DataTableCell>
      <DataTableCell><Input aria-label="Price cents" type="number" min={0} value={form.priceCents} required fieldSize="sm" unit="¢" onChange={(e) => update('priceCents', e.currentTarget.value)} /></DataTableCell>
      <DataTableCell><Input aria-label="Stock" type="number" min={0} value={form.stock} required fieldSize="sm" onChange={(e) => update('stock', e.currentTarget.value)} /></DataTableCell>
      <DataTableCell><Input aria-label="Position" type="number" min={0} value={form.position} required fieldSize="sm" onChange={(e) => update('position', e.currentTarget.value)} /></DataTableCell>
      <DataTableCell className={styles.actionsCell}>
        <Button type="button" variant="secondary" size="xs" disabled={busy} onClick={() => void save()}>
          <SaveSolidIcon size={12} aria-hidden="true" />
          <span>Save</span>
        </Button>
        {variant && (
          <Button type="button" variant="ghost" tone="danger" size="xs" iconOnly aria-label="Delete variant" disabled={busy} onClick={() => void remove()}>
            <TrashSolidIcon size={12} aria-hidden="true" />
          </Button>
        )}
      </DataTableCell>
    </DataTableRow>
  )
}
