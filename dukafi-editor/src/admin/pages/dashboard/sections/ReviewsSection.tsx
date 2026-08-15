/**
 * ReviewsSection — moderating what customers said before it reaches the shop.
 *
 * Reviews are other people's words on a public page, so nothing here publishes
 * itself: a review arrives pending and stays invisible until someone approves
 * it. Pending ones sort to the top because they are the only rows that need a
 * decision.
 *
 * Approving rebuilds every page that lists reviews as part of the same
 * request — published pages are static files, so a review approved without
 * that would sit in the database while the storefront kept serving the old
 * HTML. The button says "Approve", and what it means is "put this in front of
 * customers now".
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Type, type Static } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import type { CommerceData } from '../hooks/useCommerceData'
import styles from '../DashboardPage.module.css'

const ReviewSchema = Type.Object({
  id: Type.String(),
  authorName: Type.String(),
  rating: Type.Number(),
  body: Type.String(),
  status: Type.String(),
  verified: Type.Boolean(),
  productSlug: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.Union([Type.String(), Type.Null()]),
})
const ReviewListSchema = Type.Object({
  reviews: Type.Array(ReviewSchema),
  total: Type.Number(),
  pending: Type.Number(),
})

type Review = Static<typeof ReviewSchema>
type Filter = 'any' | 'pending' | 'approved'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'pending', label: 'Needs review' },
  { id: 'approved', label: 'On the site' },
  { id: 'any', label: 'All' },
]

function when(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

/** Pre-rendered rather than looped: five characters, no component needed. */
function stars(rating: number): string {
  const whole = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(whole) + '☆'.repeat(5 - whole)
}

const REVIEW_FORM_ID = 'commerce-review-form'

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${stars(value)}  ${value} of 5`,
  textValue: `${value} of 5`,
}))

export function ReviewsSection({ data }: { data: CommerceData }) {
  const [creating, setCreating] = useState(false)
  const [publishNow, setPublishNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [pending, setPending] = useState(0)
  const [filter, setFilter] = useState<Filter>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (which: Filter) => {
    try {
      const query = which === 'any' ? '' : `?status=${which}`
      const result = await apiRequest(`/admin/api/cms/reviews${query}`, {
        schema: ReviewListSchema,
        fallbackMessage: 'Could not load reviews',
      })
      setReviews(result.reviews)
      setPending(result.pending)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load reviews'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(filter) }, [load, filter])

  const act = async (review: Review, action: 'approve' | 'unapprove') => {
    setBusy(review.id)
    try {
      await apiRequest(`/admin/api/cms/reviews/${encodeURIComponent(review.id)}/${action}`, {
        method: 'POST',
        fallbackMessage: `Could not ${action} the review`,
      })
      await load(filter)
    } catch (err) {
      setError(getErrorMessage(err, `Could not ${action} the review`))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (review: Review) => {
    setBusy(review.id)
    try {
      await apiRequest(`/admin/api/cms/reviews/${encodeURIComponent(review.id)}`, {
        method: 'DELETE',
        fallbackMessage: 'Could not delete the review',
      })
      await load(filter)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the review'))
    } finally {
      setBusy(null)
    }
  }

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const authorName = String(form.get('authorName') ?? '').trim()
    const body = String(form.get('body') ?? '').trim()
    if (authorName.length === 0 || body.length === 0) return

    setSaving(true)
    try {
      const created = await apiRequest('/admin/api/cms/reviews', {
        method: 'POST',
        body: {
          authorName,
          body,
          rating: Number(form.get('rating') ?? 5),
          productSlug: String(form.get('productSlug') ?? ''),
        },
        schema: Type.Object({ review: ReviewSchema }),
        fallbackMessage: 'Could not add the review',
      })
      // Created pending like every other way in, then approved as a second
      // call if asked. One rule everywhere beats a shortcut here.
      if (publishNow) {
        await apiRequest(`/admin/api/cms/reviews/${encodeURIComponent(created.review.id)}/approve`, {
          method: 'POST',
          fallbackMessage: 'Added, but could not publish it',
        })
      }
      setCreating(false)
      setPublishNow(false)
      setError(null)
      // Land on the filter the new review is actually in, rather than leaving
      // the merchant looking at a list it never joined.
      const next: Filter = publishNow ? 'approved' : 'pending'
      setFilter(next)
      await load(next)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add the review'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.section} aria-label="Reviews">
      <header className={styles.sectionHeader}>
        <div>
          <h2>Reviews</h2>
          <p className={styles.connectHint}>
            {pending > 0
              ? `${pending} waiting for you. Nothing appears on the site until you approve it.`
              : 'Nothing waiting. Approved reviews show wherever a page lists them.'}
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.inlineForm}>
          {FILTERS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={filter === option.id ? 'secondary' : 'ghost'}
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="primary" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon size={14} aria-hidden="true" />
          <span>New review</span>
        </Button>
      </div>

      {creating && (
        <ReviewDialog
          products={data.products}
          publishNow={publishNow}
          onPublishNowChange={setPublishNow}
          busy={saving}
          onSave={create}
          onClose={() => setCreating(false)}
        />
      )}

      {loading ? null : reviews.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'Nothing waiting' : 'No reviews yet'}
          description={
            filter === 'pending'
              ? 'Reviews needing a decision appear here.'
              : 'Reviews arrive from a review form, or can be added by a connected AI client.'
          }
        />
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>Who</DataTableHeader>
              <DataTableHeader>Rating</DataTableHeader>
              <DataTableHeader>What they said</DataTableHeader>
              <DataTableHeader>Product</DataTableHeader>
              <DataTableHeader>Received</DataTableHeader>
              <DataTableHeader> </DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {reviews.map((review) => (
              <DataTableRow key={review.id}>
                <DataTableCell>
                  {review.authorName}
                  {/* Only true when the review is attached to a real order. */}
                  {review.verified && <span className={styles.connectHint}> · Verified buyer</span>}
                </DataTableCell>
                <DataTableCell>
                  <span aria-label={`${review.rating} out of 5`}>{stars(review.rating)}</span>
                </DataTableCell>
                <DataTableCell>{review.body}</DataTableCell>
                <DataTableCell>{review.productSlug || 'The store'}</DataTableCell>
                <DataTableCell>{when(review.createdAt)}</DataTableCell>
                <DataTableCell>
                  {review.status === 'approved' ? (
                    <Button type="button" variant="ghost" size="sm"
                            disabled={busy === review.id}
                            onClick={() => void act(review, 'unapprove')}>
                      Take down
                    </Button>
                  ) : (
                    <Button type="button" variant="primary" size="sm"
                            disabled={busy === review.id}
                            onClick={() => void act(review, 'approve')}>
                      Approve
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm"
                          disabled={busy === review.id}
                          onClick={() => void remove(review)}>
                    Delete
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  )
}

/**
 * Writing down something a customer said elsewhere — by email, on WhatsApp, in
 * the shop. For most small stores that is where the praise actually lives, and
 * it reaches a page only if someone types it in.
 *
 * A dialog rather than a form parked above the table, matching how products
 * and collections are created: the list stays the list.
 */
function ReviewDialog({
  products,
  publishNow,
  onPublishNowChange,
  busy,
  onSave,
  onClose,
}: {
  products: CommerceData['products']
  publishNow: boolean
  onPublishNowChange: (next: boolean) => void
  busy: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  const productOptions = [
    { value: '', label: 'The store as a whole', textValue: 'The store as a whole' },
    ...products.map((product) => ({ value: product.slug, label: product.title, textValue: product.title })),
  ]

  return (
    <Dialog
      open
      onClose={onClose}
      title="New review"
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            <span>Cancel</span>
          </Button>
          <Button type="submit" form={REVIEW_FORM_ID} variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>{busy ? 'Saving…' : 'Add this review'}</span>
          </Button>
        </>
      }
    >
      <form id={REVIEW_FORM_ID} className={styles.dialogForm} onSubmit={onSave}>
        <FormField label="Customer" htmlFor="review-author" description="Shown next to the review, so use the name they would expect to see.">
          <Input id="review-author" name="authorName" required />
        </FormField>
        <FormField label="Rating" htmlFor="review-rating">
          <Select id="review-rating" name="rating" defaultValue="5" options={RATING_OPTIONS} />
        </FormField>
        <FormField label="What they said" htmlFor="review-body" description="Their words, not a summary of them.">
          <textarea id="review-body" name="body" className={styles.descriptionInput} rows={4} required />
        </FormField>
        <FormField label="About" htmlFor="review-product" description="Reviews of one product can be listed on that product's page.">
          <Select id="review-product" name="productSlug" defaultValue="" options={productOptions} />
        </FormField>
        <FormField
          label="Publishing"
          description="Typed in here, a review still arrives pending — tick this only if you are sure of the wording."
        >
          <label className={styles.checkboxRow}>
            <Checkbox
              boxSize="sm"
              name="publishNow"
              checked={publishNow}
              onCheckedChange={onPublishNowChange}
            />
            <span className={styles.identityLabel}>Put it on the site straight away</span>
          </label>
        </FormField>
      </form>
      {/* No "verified buyer" control: that badge is true only when a review is
          attached to a real order, so it is never something to tick. */}
    </Dialog>
  )
}
