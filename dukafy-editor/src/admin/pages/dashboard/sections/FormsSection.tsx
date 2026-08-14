/**
 * FormsSection — read back what the site's forms caught.
 *
 * Submissions have been stored since the public `/forms/<id>` route shipped,
 * with nowhere to see them: a contact form took a message, thanked the
 * customer, and the merchant never learned they wrote.
 *
 * The payload is schemaless on purpose — the merchant invented the field
 * names — so this cannot render fixed columns. Instead the field names are
 * DERIVED from the submissions actually present, which means a form that
 * gained a field last week shows it without anything here changing.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import type { FormSubmission, FormSummary } from '../types'
import styles from '../DashboardPage.module.css'

/** Every field name across these submissions, in first-seen order. */
function columnsFor(submissions: FormSubmission[]): string[] {
  const seen: string[] = []
  for (const submission of submissions) {
    for (const key of Object.keys(submission.fields)) {
      if (!seen.includes(key)) seen.push(key)
    }
  }
  return seen
}

function when(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function FormsSection() {
  const [forms, setForms] = useState<FormSummary[]>([])
  const [openForm, setOpenForm] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadForms = useCallback(async () => {
    try {
      setForms((await commerceApi.listForms()).forms)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load forms'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadForms() }, [loadForms])

  async function openSubmissions(formId: string) {
    setOpenForm(formId)
    setSubmissions([])
    try {
      const page = await commerceApi.listSubmissions(formId)
      setSubmissions(page.submissions)
      setTotal(page.total)
      setHasMore(page.hasMore)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load submissions'))
    }
  }

  /**
   * Append, rather than replace: a merchant scanning for one enquiry keeps
   * everything already on screen. Offset comes from what is loaded, so a
   * deletion in between shifts the window by one rather than skipping a row.
   */
  async function loadMore() {
    if (!openForm || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await commerceApi.listSubmissions(openForm, submissions.length)
      setSubmissions((current) => [...current, ...page.submissions])
      setTotal(page.total)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load more submissions'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function remove(id: number) {
    if (!openForm) return
    try {
      await commerceApi.deleteSubmission(openForm, id)
      setSubmissions((current) => current.filter((submission) => submission.id !== id))
      setTotal((current) => Math.max(0, current - 1))
      void loadForms()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete that submission'))
    }
  }

  if (loading) return null

  if (error) {
    return <EmptyState title="Something went wrong" description={error} />
  }

  if (forms.length === 0) {
    return (
      <EmptyState
        title="No form submissions yet"
        description="Every form you build in the editor posts here. Submissions appear as soon as someone sends one."
      />
    )
  }

  if (!openForm) {
    return (
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>Form</DataTableHeader>
            <DataTableHeader>Submissions</DataTableHeader>
            <DataTableHeader>Last received</DataTableHeader>
            <DataTableHeader />
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {forms.map((form) => (
            <DataTableRow key={form.id}>
              <DataTableCell>{form.id}</DataTableCell>
              <DataTableCell>{form.count}</DataTableCell>
              <DataTableCell>{when(form.lastAt)}</DataTableCell>
              <DataTableCell>
                <Button variant="secondary" size="xs" onClick={() => void openSubmissions(form.id)}>
                  View
                </Button>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    )
  }

  const columns = columnsFor(submissions)

  return (
    <div className={styles.section}>
      <div className={styles.formsBackBar}>
        <Button variant="ghost" size="xs" onClick={() => { setOpenForm(null); setSubmissions([]) }}>
          ← All forms
        </Button>
        <span>{openForm}</span>
        {total > 0 && (
          <span>
            {submissions.length === total
              ? `${total} submission${total === 1 ? '' : 's'}`
              : `Showing ${submissions.length} of ${total}`}
          </span>
        )}
      </div>

      {submissions.length === 0 ? (
        <EmptyState title="Nothing here" description="This form has no submissions." />
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>Received</DataTableHeader>
              {columns.map((column) => <DataTableHeader key={column}>{column}</DataTableHeader>)}
              <DataTableHeader />
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {submissions.map((submission) => (
              <DataTableRow key={submission.id}>
                <DataTableCell>{when(submission.createdAt)}</DataTableCell>
                {columns.map((column) => (
                  <DataTableCell key={column}>{String(submission.fields[column] ?? '')}</DataTableCell>
                ))}
                <DataTableCell>
                  <Button variant="ghost" size="xs" tone="danger" onClick={() => void remove(submission.id)}>
                    Delete
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {hasMore && (
        <div className={styles.formsBackBar}>
          <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(50, total - submissions.length)} more`}
          </Button>
        </div>
      )}
    </div>
  )
}
