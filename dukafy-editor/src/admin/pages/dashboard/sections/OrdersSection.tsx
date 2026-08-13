/**
 * OrdersSection — the Commerce workspace's Orders tab.
 *
 * Plain paginated table; the detail opens in a Dialog rather than a
 * master-detail canvas, matching the rest of this workspace.
 *
 * The detail shows the order's line items AND every merchant-defined form
 * filed against it. Those payloads are rendered generically as key/value
 * rows: Dukafy never chose their shape, so it cannot lay them out — a
 * hardcoded "address" or "M-Pesa" panel would break the moment a merchant
 * invents a form we didn't anticipate.
 */
import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { SearchBar } from '@ui/components/SearchBar'
import { Select } from '@ui/components/Select'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import { Pagination } from '../components/Pagination'
import type { CommerceData } from '../hooks/useCommerceData'
import { ORDER_STATUSES, type Order } from '../types'
import styles from '../DashboardPage.module.css'

function money(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/** Who placed it — whichever identifier they actually gave. */
function who(order: Order): string {
  return order.customerName || order.email || order.phone || '—'
}

export function OrdersSection({ data }: { data: CommerceData }) {
  const { orders, error, setError, refresh } = data
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [openOrder, setOpenOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? orders.filter((order) =>
      String(order.id).includes(q) ||
        who(order).toLowerCase().includes(q) ||
        order.status.toLowerCase().includes(q))
    : orders
  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const clampedPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  // Re-read from the refreshed list so the open dialog shows the new status
  // rather than the snapshot it was opened with.
  const detail = openOrder ? orders.find((order) => order.id === openOrder.id) ?? openOrder : null

  async function changeStatus(order: Order, status: string) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.updateOrderStatus(order.id, status)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the order'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <SearchBar
          value={query}
          onValueChange={(value) => { setQuery(value); setPage(1) }}
          placeholder="Search orders…"
          aria-label="Search orders"
        />
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {pageItems.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? 'No orders yet.' : 'No orders match your search.'}
          description={orders.length === 0 ? 'Orders appear here as soon as a customer checks out.' : undefined}
        />
      ) : (
        <>
          <DataTable aria-label="Orders" density="compact">
            <DataTableHead>
              <DataTableRow>
                <DataTableHeader scope="col">Order</DataTableHeader>
                <DataTableHeader scope="col">Placed</DataTableHeader>
                <DataTableHeader scope="col">Customer</DataTableHeader>
                <DataTableHeader scope="col">Status</DataTableHeader>
                <DataTableHeader scope="col">Total</DataTableHeader>
                <DataTableHeader scope="col">Forms</DataTableHeader>
                <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {pageItems.map((order) => (
                <DataTableRow key={order.id}>
                  <DataTableCell>#{order.id}</DataTableCell>
                  <DataTableCell>{when(order.createdAt)}</DataTableCell>
                  <DataTableCell>{who(order)}</DataTableCell>
                  <DataTableCell>{order.status}</DataTableCell>
                  <DataTableCell>{money(order.totalCents, order.currency)}</DataTableCell>
                  <DataTableCell>{order.submissions.length || '—'}</DataTableCell>
                  <DataTableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setOpenOrder(order)}
                      data-testid={`order-open-${order.id}`}
                    >
                      View
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>

          <Pagination
            page={clampedPage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        </>
      )}

      <Dialog
        open={detail !== null}
        onClose={() => setOpenOrder(null)}
        title={detail ? `Order #${detail.id}` : 'Order'}
        footer={
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpenOrder(null)}>
            <span>Close</span>
          </Button>
        }
      >
        {detail && (
          <div className={styles.orderDetail}>
            <dl className={styles.orderMeta}>
              <div><dt>Placed</dt><dd>{when(detail.createdAt)}</dd></div>
              <div><dt>Customer</dt><dd>{who(detail)}</dd></div>
              {detail.email && <div><dt>Email</dt><dd>{detail.email}</dd></div>}
              {detail.phone && <div><dt>Phone</dt><dd>{detail.phone}</dd></div>}
            </dl>

            <label className={styles.orderStatus}>
              <span>Status</span>
              <Select
                value={detail.status}
                disabled={busy}
                onChange={(event) => void changeStatus(detail, event.currentTarget.value)}
                data-testid="order-status-select"
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </Select>
            </label>

            <DataTable aria-label="Order items" density="compact">
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader scope="col">Item</DataTableHeader>
                  <DataTableHeader scope="col">Qty</DataTableHeader>
                  <DataTableHeader scope="col">Unit</DataTableHeader>
                  <DataTableHeader scope="col">Total</DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {detail.items.map((item) => (
                  <DataTableRow key={item.id}>
                    <DataTableCell>{item.productTitle} — {item.variantTitle}</DataTableCell>
                    <DataTableCell>{item.quantity}</DataTableCell>
                    <DataTableCell>{money(item.unitPriceCents, detail.currency)}</DataTableCell>
                    <DataTableCell>{money(item.lineTotalCents, detail.currency)}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>

            <dl className={styles.orderTotals}>
              <div><dt>Subtotal</dt><dd>{money(detail.subtotalCents, detail.currency)}</dd></div>
              {detail.discountCents > 0 && (
                <div><dt>Discount</dt><dd>−{money(detail.discountCents, detail.currency)}</dd></div>
              )}
              <div><dt>Total</dt><dd>{money(detail.totalCents, detail.currency)}</dd></div>
            </dl>

            <section className={styles.orderForms}>
              <h3>Submitted forms</h3>
              {detail.submissions.length === 0 ? (
                <p className={styles.orderFormsEmpty}>Nothing filed against this order.</p>
              ) : (
                detail.submissions.map((submission) => (
                  <article key={submission.id} className={styles.orderForm}>
                    <header>
                      <strong>{submission.formId}</strong>
                      <span>{when(submission.createdAt)}</span>
                    </header>
                    {/* Rendered generically: the merchant defined these fields,
                        so there is no fixed layout that could fit them all. */}
                    <dl>
                      {Object.entries(submission.payload).map(([key, value]) => (
                        <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                      ))}
                    </dl>
                  </article>
                ))
              )}
            </section>
          </div>
        )}
      </Dialog>
    </div>
  )
}
