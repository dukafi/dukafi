/**
 * Commerce → Discounts.
 *
 * Same table + dialog shape as Products and Collections. What is different is
 * that a discount is money leaving the store, so the table leads with what
 * each code has actually cost and earned rather than only what it is set to:
 * `redemptions`, the orders it produced, and the revenue on them.
 *
 * `status` is not a stored field. It is derived from the clock and the usage
 * count by the server, in the same call `DiscountLookup` makes when a customer
 * types the code — so this screen can never say "active" about a code the cart
 * is refusing.
 *
 * Scope — whole catalogue, some products, some collections, or both — is the
 * rows in `discount_products` / `discount_collections`, not a stored kind.
 * The form mirrors that: picking nothing means everything, which is the one
 * state that cannot be inconsistent.
 *
 * Deleting is not always deleting. A code that has been redeemed is ended
 * instead of destroyed, because orders record the code string they were
 * charged under. The server decides; the confirm dialog says which will
 * happen, and the row stays when it survives.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Type, type Static } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { Checkbox } from '@ui/components/Checkbox'
import { Select } from '@ui/components/Select'
import { TagPill } from '@ui/components/TagPill'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { Pagination } from '../components/Pagination'
import { RowActionMenu } from '../components/RowActionMenu'
import type { CommerceData } from '../hooks/useCommerceData'
import styles from '../DashboardPage.module.css'

const DiscountSchema = Type.Object({
  id: Type.String(),
  code: Type.String(),
  kind: Type.String(),
  value: Type.Number(),
  status: Type.String(),
  startsAt: Type.Union([Type.String(), Type.Null()]),
  endsAt: Type.Union([Type.String(), Type.Null()]),
  usageLimit: Type.Union([Type.Number(), Type.Null()]),
  scope: Type.Object({
    kind: Type.String(),
    productSlugs: Type.Array(Type.String()),
    collectionSlugs: Type.Array(Type.String()),
  }),
  redemptions: Type.Number(),
  ordersWithCode: Type.Number(),
  revenueCents: Type.Number(),
  discountedCents: Type.Number(),
})
const DiscountListSchema = Type.Object({
  discounts: Type.Array(DiscountSchema),
  total: Type.Number(),
  currency: Type.String(),
})
const DiscountEnvelope = Type.Object({ discount: DiscountSchema })

type Discount = Static<typeof DiscountSchema>

const KIND_OPTIONS = [
  { value: 'percentage', label: 'Percentage off', textValue: 'Percentage off' },
  { value: 'fixed', label: 'Fixed amount off', textValue: 'Fixed amount off' },
]

/** Mirrors `formatCents` in ProductsSection, which mirrors Ruby's format_price. */
function formatCents(cents: number, currency: string) {
  const amount = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

function formatValue(discount: Discount, currency: string): string {
  return discount.kind === 'percentage'
    ? `${discount.value}% off`
    : `${formatCents(discount.value, currency)} off`
}

/** What a merchant needs to read at a glance; the exact dates live in the form. */
function formatWhen(discount: Discount): string {
  const ends = discount.endsAt ? new Date(discount.endsAt) : null
  if (discount.status === 'scheduled' && discount.startsAt) {
    return `From ${new Date(discount.startsAt).toLocaleDateString()}`
  }
  if (!ends) return 'No end date'
  return `${discount.status === 'expired' ? 'Ended' : 'Until'} ${ends.toLocaleDateString()}`
}

/**
 * What the code covers, in one cell. Counts rather than names: a code scoped
 * to nine products would otherwise push every other column off the row.
 */
function formatScope(discount: Discount): string {
  const { productSlugs, collectionSlugs } = discount.scope
  if (productSlugs.length === 0 && collectionSlugs.length === 0) return 'Whole catalogue'
  const parts: string[] = []
  if (productSlugs.length > 0) {
    parts.push(productSlugs.length === 1 ? productSlugs[0] : `${productSlugs.length} products`)
  }
  if (collectionSlugs.length > 0) {
    parts.push(collectionSlugs.length === 1
      ? `${collectionSlugs[0]} collection`
      : `${collectionSlugs.length} collections`)
  }
  return parts.join(' + ')
}

/** A code that cannot currently be used reads as muted, the way a draft does. */
const DONE_STATUSES = new Set(['expired', 'exhausted'])

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function DiscountsSection({ data }: { data: CommerceData }) {
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [currency, setCurrency] = useState('KES')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Discount | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<Discount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await apiRequest('/admin/api/cms/discounts', {
        schema: DiscountListSchema,
        fallbackMessage: 'Could not load discounts',
      })
      setDiscounts(result.discounts)
      setCurrency(result.currency)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load discounts'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const pageCount = Math.max(Math.ceil(discounts.length / pageSize), 1)
  const clampedPage = Math.min(page, pageCount)
  const pageItems = discounts.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  function closeDialog() {
    setDialogMode(null)
    setEditing(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    // Local `datetime-local` values are converted back to real instants — a
    // sale starting "09:00" means 09:00 where the merchant is.
    const at = (key: string) => {
      const raw = String(form.get(key) || '')
      return raw ? new Date(raw).toISOString() : null
    }
    const limit = String(form.get('usageLimit') || '').trim()
    const body: Record<string, unknown> = {
      code: String(form.get('code') || ''),
      kind: String(form.get('kind') || 'percentage'),
      value: Number(form.get('value') || 0),
      startsAt: at('startsAt'),
      // Explicit null rather than an omitted key: on edit, blanking the field
      // has to be able to MEAN "no end date" and "unlimited".
      endsAt: at('endsAt'),
      usageLimit: limit ? Number(limit) : null,
      // Always sent, both of them. An omitted key means "leave the scope
      // alone" to the server, so narrowing a code and then widening it again
      // would be impossible if these were only included when non-empty.
      productSlugs: form.getAll('productSlugs').map(String),
      collectionSlugs: form.getAll('collectionSlugs').map(String),
    }

    setBusy(true)
    try {
      if (editing) {
        await apiRequest(`/admin/api/cms/discounts/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH', body, schema: DiscountEnvelope, fallbackMessage: 'Could not save the discount',
        })
      } else {
        await apiRequest('/admin/api/cms/discounts', {
          method: 'POST', body, schema: DiscountEnvelope, fallbackMessage: 'Could not create the discount',
        })
      }
      setError(null)
      closeDialog()
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the discount'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(discount: Discount) {
    setBusy(true)
    try {
      await apiRequest(`/admin/api/cms/discounts/${encodeURIComponent(discount.id)}`, {
        method: 'DELETE',
        fallbackMessage: 'Could not delete the discount',
      })
      setError(null)
      setRemoveCandidate(null)
      // Reloaded rather than removed from state: a redeemed code is ended
      // instead of deleted, so the row may still be there — with a different
      // status. Guessing here would show the merchant a delete that did not
      // happen.
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the discount'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <p className={styles.connectHint}>
          A code works the moment it exists. Give it a start date to prepare one ahead of time.
        </p>
        <Button type="button" variant="primary" size="sm" onClick={() => { setEditing(null); setDialogMode('create') }}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New discount</span>
        </Button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {loading ? null : pageItems.length === 0 ? (
        <EmptyState
          title="No discount codes yet."
          description="Create one and customers can type it into the cart. Nothing appears on the storefront on its own."
        />
      ) : (
        <DataTable aria-label="Discounts" density="compact">
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader scope="col">Code</DataTableHeader>
              <DataTableHeader scope="col">Discount</DataTableHeader>
              <DataTableHeader scope="col">Applies to</DataTableHeader>
              <DataTableHeader scope="col">Status</DataTableHeader>
              <DataTableHeader scope="col">When</DataTableHeader>
              <DataTableHeader scope="col">Used</DataTableHeader>
              <DataTableHeader scope="col">Revenue</DataTableHeader>
              <DataTableHeader scope="col">Given away</DataTableHeader>
              <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {pageItems.map((discount) => (
              <DataTableRow key={discount.id} aria-label={`Discount ${discount.code}`}>
                <DataTableCell><strong>{discount.code}</strong></DataTableCell>
                <DataTableCell>{formatValue(discount, currency)}</DataTableCell>
                <DataTableCell>{formatScope(discount)}</DataTableCell>
                <DataTableCell>
                  <TagPill label={discount.status} muted={DONE_STATUSES.has(discount.status)} size="xs" />
                </DataTableCell>
                <DataTableCell>{formatWhen(discount)}</DataTableCell>
                <DataTableCell>
                  {discount.redemptions}
                  {discount.usageLimit !== null && ` / ${discount.usageLimit}`}
                </DataTableCell>
                {/* From the orders themselves, so this is what the code was
                    worth — not how often it was typed. */}
                <DataTableCell>{formatCents(discount.revenueCents, currency)}</DataTableCell>
                <DataTableCell>{formatCents(discount.discountedCents, currency)}</DataTableCell>
                <DataTableCell className={styles.actionsCell}>
                  <RowActionMenu
                    triggerLabel={`Actions for ${discount.code}`}
                    menuLabel={`Discount actions for ${discount.code}`}
                    items={[
                      { label: 'Edit', icon: <EditSolidIcon size={12} aria-hidden="true" />, onSelect: () => { setEditing(discount); setDialogMode('edit') } },
                      { label: 'Delete', icon: <TrashSolidIcon size={12} aria-hidden="true" />, danger: true, onSelect: () => setRemoveCandidate(discount) },
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
        total={discounts.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />

      {dialogMode && (
        <DiscountDialog
          mode={dialogMode}
          discount={editing}
          currency={currency}
          products={data.products}
          collections={data.collections}
          busy={busy}
          onSave={handleSave}
          onClose={closeDialog}
        />
      )}

      <Dialog
        open={removeCandidate !== null}
        onClose={() => setRemoveCandidate(null)}
        title={removeCandidate && removeCandidate.redemptions > 0 ? 'End this code?' : 'Delete discount?'}
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveCandidate(null)} disabled={busy}>
              <span>Cancel</span>
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => removeCandidate && void handleDelete(removeCandidate)}>
              <TrashSolidIcon size={13} aria-hidden="true" />
              <span>{removeCandidate && removeCandidate.redemptions > 0 ? 'End it now' : 'Delete discount'}</span>
            </Button>
          </>
        }
      >
        {removeCandidate && removeCandidate.redemptions > 0 ? (
          <p>
            “{removeCandidate.code}” has been used on {removeCandidate.redemptions} order(s), which record the code they
            were charged under — so it is kept and ended rather than deleted. It stops working immediately.
          </p>
        ) : (
          <p>This permanently deletes “{removeCandidate?.code}”. It has never been used, so nothing else refers to it.</p>
        )}
      </Dialog>
    </div>
  )
}

const DISCOUNT_FORM_ID = 'commerce-discount-form'

function DiscountDialog({
  mode,
  discount,
  currency,
  products,
  collections,
  busy,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  discount: Discount | null
  currency: string
  products: CommerceData['products']
  collections: CommerceData['collections']
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  // Only to label the value field — the server decides what the value means.
  const [kind, setKind] = useState(discount?.kind ?? 'percentage')
  const [productSlugs, setProductSlugs] = useState(() => new Set(discount?.scope.productSlugs ?? []))
  const [collectionSlugs, setCollectionSlugs] = useState(() => new Set(discount?.scope.collectionSlugs ?? []))

  function toggle(set: Set<string>, apply: (next: Set<string>) => void, slug: string, on: boolean) {
    const next = new Set(set)
    if (on) next.add(slug)
    else next.delete(slug)
    apply(next)
  }

  const everything = productSlugs.size === 0 && collectionSlugs.size === 0

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'create' ? 'New discount' : `Edit ${discount?.code}`}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            <span>Cancel</span>
          </Button>
          <Button type="submit" form={DISCOUNT_FORM_ID} variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>{mode === 'create' ? 'Create this discount' : 'Save discount'}</span>
          </Button>
        </>
      }
    >
      <form id={DISCOUNT_FORM_ID} className={styles.dialogForm} onSubmit={onSave}>
        <FormField
          label="Code"
          htmlFor="discount-code"
          description="What the customer types. Stored uppercase; letters, numbers, hyphens and underscores only."
        >
          <Input id="discount-code" name="code" required defaultValue={discount?.code} monospace />
        </FormField>

        <FormField label="Kind" htmlFor="discount-kind">
          <Select
            id="discount-kind"
            name="kind"
            defaultValue={discount?.kind ?? 'percentage'}
            options={KIND_OPTIONS}
            onChange={(event) => setKind(event.target.value)}
          />
        </FormField>

        <FormField
          label={kind === 'percentage' ? 'Percent off' : `Amount off (${currency}, in cents)`}
          htmlFor="discount-value"
          description={kind === 'percentage'
            ? '1 to 100.'
            : 'In cents — 5000 is 50.00. Never more than the cart is worth.'}
        >
          <Input
            id="discount-value"
            name="value"
            type="number"
            min={1}
            max={kind === 'percentage' ? 100 : undefined}
            required
            defaultValue={discount?.value ?? (kind === 'percentage' ? 10 : 500)}
          />
        </FormField>

        <FormField label="Starts" htmlFor="discount-starts" description="Leave blank to start now.">
          <Input id="discount-starts" name="startsAt" type="datetime-local" defaultValue={toLocalInput(discount?.startsAt ?? null)} />
        </FormField>

        <FormField
          label="Ends"
          htmlFor="discount-ends"
          description="Leave blank for no end. Setting this in the past is how you stop a live code while keeping its history."
        >
          <Input id="discount-ends" name="endsAt" type="datetime-local" defaultValue={toLocalInput(discount?.endsAt ?? null)} />
        </FormField>

        <FormField label="Usage limit" htmlFor="discount-limit" description="Total redemptions allowed. Blank means unlimited.">
          <Input id="discount-limit" name="usageLimit" type="number" min={1} defaultValue={discount?.usageLimit ?? ''} />
        </FormField>

        <FormField
          label="Applies to"
          description={everything
            ? 'Nothing picked, so this code covers the whole catalogue.'
            : 'Only the items picked below are discounted. Everything else in the cart is charged in full.'}
        >
          {/* Collections first: picking one is the common case, and it keeps
              covering products added to it later. */}
          {collections.length > 0 && (
            <ul className={styles.memberList}>
              {collections.map((collection) => (
                <li key={collection.slug} className={styles.memberRow}>
                  <label className={styles.checkboxRow}>
                    <Checkbox
                      boxSize="sm"
                      name="collectionSlugs"
                      value={collection.slug}
                      checked={collectionSlugs.has(collection.slug)}
                      onCheckedChange={(on) => toggle(collectionSlugs, setCollectionSlugs, collection.slug, on)}
                    />
                    <span className={styles.identityLabel}>{collection.title} collection</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {products.length === 0 ? (
            <p className={styles.emptyInline}>No products yet.</p>
          ) : (
            <ul className={styles.memberList}>
              {products.map((product) => (
                <li key={product.slug} className={styles.memberRow}>
                  <label className={styles.checkboxRow}>
                    <Checkbox
                      boxSize="sm"
                      name="productSlugs"
                      value={product.slug}
                      checked={productSlugs.has(product.slug)}
                      onCheckedChange={(on) => toggle(productSlugs, setProductSlugs, product.slug, on)}
                    />
                    <span className={styles.identityLabel}>{product.title}</span>
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
