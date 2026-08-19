/**
 * Commerce → Products.
 *
 * Plain data table + pagination + dialogs — no master-detail canvas. "New
 * product"/row "Edit" open `ProductDialog` (create and edit share one
 * dialog, mirroring `users/components/UserDialog.tsx`); variants live in
 * their own `VariantsDialog` opened from the row action menu, not inline.
 * Inside it, variants are a read-only list and create/edit is a real form —
 * a row of always-live inputs saved half-typed values on a stray click.
 */
import { useState, type FormEvent } from 'react'
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
import { TagPill } from '@ui/components/TagPill'
import { getErrorMessage } from '@core/utils/errorMessage'
import { ArrowDownIcon } from 'pixel-art-icons/icons/arrow-down'
import { ArrowUpIcon } from 'pixel-art-icons/icons/arrow-up'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { ImageSolidIcon } from 'pixel-art-icons/icons/image-solid'
import { ListBoxSolidIcon } from 'pixel-art-icons/icons/list-box-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { Copy2SolidIcon } from 'pixel-art-icons/icons/copy-2-solid'
import { copyStorefrontUrl } from '@admin/lib/storefrontUrl'
import { commerceApi } from '../api'
import { Pagination } from '../components/Pagination'
import { RowActionMenu } from '../components/RowActionMenu'
import type { CommerceData } from '../hooks/useCommerceData'
import type { Collection, Plugin, Product, Variant, VariantFormState, CatalogueFieldDef } from '../types'
import { emptyVariantForm, variantFormFrom } from '../types'
import styles from '../DashboardPage.module.css'

function declaredFields(plugins: Plugin[], owner: 'product' | 'variant'): CatalogueFieldDef[] {
  return plugins.flatMap((plugin) => (owner === 'product' ? plugin.productFields : plugin.variantFields) || [])
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', textValue: 'Draft' },
  { value: 'active', label: 'Active', textValue: 'Active' },
]

// Mirrors Ruby's format_price (dukafi/publisher/modules/store/modules.rb) so
// the admin table and the storefront agree: USD gets a $ prefix, everything
// else (KES, EUR, ...) gets the code prefixed instead of a symbol we don't have.
function formatCents(cents: number, currency: string) {
  const amount = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

function priceSummary(product: Product): string {
  if (product.variants.length === 0) return '—'
  const currency = product.variants[0].currency
  const prices = product.variants.map((variant) => variant.priceCents)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatCents(min, currency) : `${formatCents(min, currency)} – ${formatCents(max, currency)}`
}

function stockSummary(product: Product): number {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0)
}

export function ProductsSection({ data }: { data: CommerceData }) {
  const { products, collections, plugins, error, setError, refresh } = data
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null)
  const [imagesProduct, setImagesProduct] = useState<Product | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = query.trim()
    ? products.filter((product) => {
      const q = query.trim().toLowerCase()
      return product.title.toLowerCase().includes(q) || product.slug.toLowerCase().includes(q)
    })
    : products
  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const clampedPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  function openCreate() {
    setEditingProduct(null)
    setDialogMode('create')
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setDialogMode('edit')
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingProduct(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fields: Record<string, string> = {}
    for (const def of declaredFields(plugins, 'product')) {
      fields[def.key] = String(form.get(`fields.${def.key}`) || '')
    }
    const input = {
      title: String(form.get('title') || ''),
      slug: String(form.get('slug') || ''),
      status: String(form.get('status') || 'draft'),
      descriptionHtml: String(form.get('descriptionHtml') || ''),
      fields,
    }
    const collectionIds = form.getAll('collectionIds').map((value) => Number(value))
    setBusy(true)
    setError(null)
    try {
      if (dialogMode === 'create') {
        const created = await commerceApi.createProduct(input)
        await commerceApi.setProductCollections(created.product.id, collectionIds)
      } else if (editingProduct) {
        await commerceApi.updateProduct(editingProduct.id, input)
        await commerceApi.setProductCollections(editingProduct.id, collectionIds)
      }
      await refresh()
      closeDialog()
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
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete product'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <SearchBar value={query} onValueChange={(value) => { setQuery(value); setPage(1) }} placeholder="Search products…" aria-label="Search products" />
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New product</span>
        </Button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {pageItems.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? 'No products yet.' : 'No products match your search.'}
          description={products.length === 0 ? 'Create your first product to start selling.' : undefined}
        />
      ) : (
        <DataTable aria-label="Products" density="compact">
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader scope="col">Name</DataTableHeader>
              <DataTableHeader scope="col">Status</DataTableHeader>
              <DataTableHeader scope="col">Variants</DataTableHeader>
              <DataTableHeader scope="col">Price</DataTableHeader>
              <DataTableHeader scope="col">Stock</DataTableHeader>
              <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {pageItems.map((product) => (
              <DataTableRow key={product.id} aria-label={`Product ${product.title}`}>
                <DataTableCell>
                  <div className={styles.identity}>
                    <strong>{product.title || 'Untitled product'}</strong>
                    <span>{product.slug}</span>
                  </div>
                </DataTableCell>
                <DataTableCell><TagPill label={product.status} muted={product.status === 'draft'} size="xs" /></DataTableCell>
                <DataTableCell>{product.variants.length}</DataTableCell>
                <DataTableCell>{priceSummary(product)}</DataTableCell>
                <DataTableCell>{stockSummary(product)}</DataTableCell>
                <DataTableCell className={styles.actionsCell}>
                  <RowActionMenu
                    triggerLabel={`Actions for ${product.title}`}
                    menuLabel={`Product actions for ${product.title}`}
                    items={[
                      { label: 'Edit', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => openEdit(product) },
                      { label: 'Copy product URL', icon: <Copy2SolidIcon size={12} aria-hidden="true" />, onSelect: () => { void copyStorefrontUrl(`/products/${product.slug}`, 'Copied product URL') } },
                      { label: 'Manage variants', icon: <ListBoxSolidIcon size={12} aria-hidden="true" />, onSelect: () => setVariantsProduct(product) },
                      { label: `Manage images (${product.images.length})`, icon: <ImageSolidIcon size={12} aria-hidden="true" />, onSelect: () => setImagesProduct(product) },
                      { label: 'Delete', icon: <TrashSolidIcon size={12} aria-hidden="true" />, danger: true, onSelect: () => setRemoveCandidate(product) },
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
        <ProductDialog
          mode={dialogMode}
          product={editingProduct}
          collections={collections}
          extraFields={declaredFields(plugins, 'product')}
          busy={busy}
          onSave={handleSave}
          onClose={closeDialog}
        />
      )}

      {variantsProduct && (
        <VariantsDialog
          product={products.find((product) => product.id === variantsProduct.id) ?? variantsProduct}
          extraFields={declaredFields(plugins, 'variant')}
          refresh={refresh}
          onClose={() => setVariantsProduct(null)}
        />
      )}

      {imagesProduct && (
        <ImagesDialog
          product={products.find((product) => product.id === imagesProduct.id) ?? imagesProduct}
          refresh={refresh}
          onClose={() => setImagesProduct(null)}
        />
      )}

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

const PRODUCT_FORM_ID = 'commerce-product-form'

function ProductDialog({
  mode,
  product,
  collections,
  extraFields,
  busy,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  product: Product | null
  collections: Collection[]
  extraFields: CatalogueFieldDef[]
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  const [selectedCollectionIds, setSelectedCollectionIds] = useState(
    () => new Set(product ? collections.filter((collection) => collection.productIds.includes(product.id)).map((collection) => collection.id) : []),
  )

  function toggleCollection(id: number, checked: boolean) {
    setSelectedCollectionIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'create' ? 'New product' : 'Edit product'}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            <span>Cancel</span>
          </Button>
          <Button type="submit" form={PRODUCT_FORM_ID} variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>{mode === 'create' ? 'Create this product' : 'Save product'}</span>
          </Button>
        </>
      }
    >
      <form id={PRODUCT_FORM_ID} className={styles.dialogForm} onSubmit={onSave}>
        <FormField label="Title" htmlFor="product-title">
          <Input id="product-title" name="title" required defaultValue={product?.title} />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="product-slug"
          description={product
            ? 'The product\u2019s URL. Changing it leaves a redirect behind.'
            : 'Leave blank to generate one from the title.'}
        >
          <Input
            id="product-slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder={product ? undefined : 'auto'}
            defaultValue={product?.slug}
            monospace
          />
        </FormField>
        <FormField label="Status" htmlFor="product-status">
          <Select id="product-status" name="status" defaultValue={product?.status ?? 'draft'} options={STATUS_OPTIONS} />
        </FormField>
        <FormField label="Description" htmlFor="product-description" description="Sanitized semantic HTML, rendered on the product page.">
          <textarea id="product-description" name="descriptionHtml" className={styles.descriptionInput} rows={4} defaultValue={product?.descriptionHtml} />
        </FormField>
        {extraFields.map((def) => (
          <FormField key={def.key} label={def.label} htmlFor={`product-field-${def.key}`} description={`From the ${def.pluginId} plugin.`}>
            <Input
              id={`product-field-${def.key}`}
              name={`fields.${def.key}`}
              type={def.type === 'integer' ? 'number' : 'text'}
              defaultValue={product?.fields?.[def.key] != null ? String(product.fields[def.key]) : ''}
            />
          </FormField>
        ))}
        <FormField label="Collections" description="Which collection pages this product shows up on.">
          {collections.length === 0 ? (
            <p className={styles.emptyInline}>No collections yet — create one under the Collections tab.</p>
          ) : (
            <ul className={styles.memberList}>
              {collections.map((collection) => (
                <li key={collection.id} className={styles.memberRow}>
                  <label className={styles.checkboxRow}>
                    <Checkbox
                      boxSize="sm"
                      name="collectionIds"
                      value={String(collection.id)}
                      checked={selectedCollectionIds.has(collection.id)}
                      onCheckedChange={(checked) => toggleCollection(collection.id, checked)}
                    />
                    <span className={styles.identityLabel}>{collection.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </FormField>
      </form>
    </Dialog>
  )
}

function VariantsDialog({ product, extraFields, refresh, onClose }: {
  product: Product
  extraFields: CatalogueFieldDef[]
  refresh: () => Promise<void>
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  // `null` = listing, `'new'` = creating, a Variant = editing that one.
  // Create and edit share one form, the way ProductDialog does.
  const [editing, setEditing] = useState<Variant | 'new' | null>(null)
  const [removing, setRemoving] = useState<Variant | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleDelete(variant: Variant) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.deleteVariant(product.id, variant.id)
      await refresh()
      setRemoving(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete variant'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Variants — ${product.title}`}
      size="xl"
      footer={<Button type="button" variant="secondary" size="sm" onClick={onClose}><span>Close</span></Button>}
    >
      {error && <p className={styles.error} role="alert">{error}</p>}

      {editing ? (
        <VariantForm
          productId={product.id}
          variant={editing === 'new' ? null : editing}
          extraFields={extraFields}
          nextPosition={product.variants.length}
          onError={setError}
          onDone={() => setEditing(null)}
          refresh={refresh}
        />
      ) : (
        <>
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
              {product.variants.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={6}>No variants yet.</DataTableCell>
                </DataTableRow>
              ) : (
                product.variants.map((variant) => (
                  <DataTableRow key={variant.id}>
                    <DataTableCell>{variant.sku}</DataTableCell>
                    <DataTableCell>{variant.title}</DataTableCell>
                    <DataTableCell>{formatCents(variant.priceCents, variant.currency)}</DataTableCell>
                    <DataTableCell>{variant.stock}</DataTableCell>
                    <DataTableCell>{variant.position}</DataTableCell>
                    <DataTableCell className={styles.actionsCell}>
                      <Button
                        type="button" variant="ghost" size="xs"
                        onClick={() => setEditing(variant)}
                        data-testid={`variant-edit-${variant.id}`}
                      >
                        <EditSolidIcon size={12} aria-hidden="true" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        type="button" variant="ghost" tone="danger" size="xs" iconOnly
                        aria-label={`Delete variant ${variant.sku}`}
                        onClick={() => setRemoving(variant)}
                      >
                        <TrashSolidIcon size={12} aria-hidden="true" />
                      </Button>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>

          <Button type="button" variant="secondary" size="xs" onClick={() => setEditing('new')} data-testid="variant-add">
            <PlusIcon size={12} aria-hidden="true" />
            <span>Add variant</span>
          </Button>
        </>
      )}

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete variant?"
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoving(null)} disabled={busy}>
              <span>Cancel</span>
            </Button>
            <Button
              type="button" variant="destructive" size="sm" disabled={busy}
              onClick={() => removing && void handleDelete(removing)}
            >
              <span>Delete</span>
            </Button>
          </>
        }
      >
        <p>This permanently deletes “{removing?.sku}”.</p>
      </Dialog>
    </Dialog>
  )
}

/**
 * Create/edit a variant — one form for both.
 *
 * Replaces the old inline row editing: a real <form> means Enter submits,
 * the browser enforces required fields, and a half-typed SKU is never saved
 * by a stray click the way a row of live inputs invited.
 */
function VariantForm({
  productId,
  variant,
  extraFields,
  nextPosition,
  onError,
  onDone,
  refresh,
}: {
  productId: number
  variant: Variant | null
  extraFields: CatalogueFieldDef[]
  nextPosition: number
  onError: (message: string | null) => void
  onDone: () => void
  refresh: () => Promise<void>
}) {
  const [form, setForm] = useState<VariantFormState>(
    variant ? variantFormFrom(variant) : { ...emptyVariantForm, position: String(nextPosition) },
  )
  const [busy, setBusy] = useState(false)

  function update<K extends keyof VariantFormState>(key: K, value: VariantFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    onError(null)
    try {
      const input = {
        sku: form.sku.trim(),
        title: form.title.trim(),
        priceCents: Number(form.priceCents),
        stock: Number(form.stock),
        position: Number(form.position),
        fields: form.fields,
      }
      if (variant) {
        await commerceApi.updateVariant(productId, variant.id, input)
      } else {
        await commerceApi.createVariant(productId, input)
      }
      await refresh()
      onDone()
    } catch (err) {
      onError(getErrorMessage(err, 'Could not save variant'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.dialogForm} onSubmit={(event) => void handleSubmit(event)}>
      <FormField label="SKU" htmlFor="variant-sku" description="Unique within this product.">
        <Input
          id="variant-sku" value={form.sku} required monospace autoFocus
          onChange={(event) => update('sku', event.currentTarget.value)}
        />
      </FormField>
      <FormField label="Title" htmlFor="variant-title">
        <Input
          id="variant-title" value={form.title} required
          onChange={(event) => update('title', event.currentTarget.value)}
        />
      </FormField>
      <FormField
        label="Price"
        htmlFor="variant-price"
        description="In cents — 13950 is 139.50. The store currency is applied automatically."
      >
        <Input
          id="variant-price" type="number" min={0} value={form.priceCents} required unit="¢"
          onChange={(event) => update('priceCents', event.currentTarget.value)}
        />
      </FormField>
      <FormField label="Stock" htmlFor="variant-stock">
        <Input
          id="variant-stock" type="number" min={0} value={form.stock} required
          onChange={(event) => update('stock', event.currentTarget.value)}
        />
      </FormField>
      <FormField label="Position" htmlFor="variant-position" description="Lowest shows first.">
        <Input
          id="variant-position" type="number" min={0} value={form.position} required
          onChange={(event) => update('position', event.currentTarget.value)}
        />
      </FormField>
      {extraFields.map((def) => (
        <FormField key={def.key} label={def.label} htmlFor={`variant-field-${def.key}`} description={`From the ${def.pluginId} plugin.`}>
          <Input
            id={`variant-field-${def.key}`}
            type={def.type === 'integer' ? 'number' : 'text'}
            value={form.fields[def.key] ?? ''}
            onChange={(event) => setForm((current) => ({
              ...current,
              fields: { ...current.fields, [def.key]: event.currentTarget.value },
            }))}
          />
        </FormField>
      ))}

      <div className={styles.dialogFormActions}>
        <Button type="button" variant="secondary" size="sm" onClick={onDone} disabled={busy}>
          <span>Cancel</span>
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          <SaveSolidIcon size={12} aria-hidden="true" />
          <span>{busy ? 'Saving…' : variant ? 'Save variant' : 'Add variant'}</span>
        </Button>
      </div>
    </form>
  )
}

function ImagesDialog({ product, refresh, onClose }: { product: Product; refresh: () => Promise<void>; onClose: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const shareId = product.ogMediaAssetId ?? product.images[0]?.id ?? null

  async function persist(mediaAssetIds: string[]) {
    setSaving(true)
    setError(null)
    try {
      await commerceApi.setProductImages(product.id, mediaAssetIds)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update images'))
    } finally {
      setSaving(false)
    }
  }

  async function setShareImage(id: number | null) {
    setSaving(true)
    setError(null)
    try {
      await commerceApi.setProductOgImage(product.id, id)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not set share image'))
    } finally {
      setSaving(false)
    }
  }

  function move(index: number, direction: -1 | 1) {
    const ids = product.images.map((image) => String(image.id))
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void persist(ids)
  }

  function remove(id: number) {
    void persist(product.images.filter((image) => image.id !== id).map((image) => String(image.id)))
  }

  return (
    <Dialog open onClose={onClose} title={`Images — ${product.title}`} size="md" footer={<Button type="button" variant="secondary" size="sm" onClick={onClose}><span>Close</span></Button>}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {product.images.length === 0 ? (
        <p className={styles.emptyInline}>No images yet. The product page shows no picture until one is added.</p>
      ) : (
        <ul className={styles.memberList}>
          {product.images.map((image, index) => (
            <li key={image.id} className={styles.memberRow}>
              <img src={image.publicPath} alt="" className={styles.imageThumb} />
              <span className={styles.identityLabel}>{image.publicPath.split('/').pop()}</span>
              <Button type="button" variant="ghost" size="xs" iconOnly aria-label="Move image up" disabled={index === 0 || saving} onClick={() => move(index, -1)}>
                <ArrowUpIcon size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="xs" iconOnly aria-label="Move image down" disabled={index === product.images.length - 1 || saving} onClick={() => move(index, 1)}>
                <ArrowDownIcon size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" tone="danger" size="xs" iconOnly aria-label="Remove image" disabled={saving} onClick={() => remove(image.id)}>
                <TrashSolidIcon size={12} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant={shareId === image.id ? 'primary' : 'ghost'}
                size="xs"
                disabled={saving}
                onClick={() => void setShareImage(product.ogMediaAssetId === image.id ? null : image.id)}
              >
                <span>{shareId === image.id ? 'Share image' : 'Use for sharing'}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="ghost" size="xs" disabled={saving} onClick={() => setPickerOpen(true)}>
        <PlusIcon size={12} aria-hidden="true" />
        <span>Add image</span>
      </Button>
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaKind="image"
        allowMultiple
        currentValues={[]}
        onPick={(asset) => void persist([...product.images.map((image) => String(image.id)), asset.id]).then(() => setPickerOpen(false))}
        onPickMultiple={(assets) => void persist([...product.images.map((image) => String(image.id)), ...assets.map((asset) => asset.id)]).then(() => setPickerOpen(false))}
      />
    </Dialog>
  )
}
