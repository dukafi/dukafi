import { useState } from 'react'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { StackedBar } from '@ui/components/charts'
import { ORDER_STATUSES } from '../types'
import { useCommerceStats } from '../hooks/useCommerceStats'
import type { StatsPeriod } from '../types'
import styles from '../DashboardPage.module.css'
import { PeriodHeader, money } from './analytics/AnalyticsChrome'

const STATUS_COLORS = [
  'var(--text-bright)',
  'var(--text-muted)',
  'var(--text-subtle)',
  'var(--border-strong)',
  'var(--border-subtle)',
]

export function AnalyticsSalesSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading, error } = useCommerceStats(period)

  return (
    <div className={styles.section}>
      <PeriodHeader
        title="Sales"
        description="Order status, payment attempts, and carts that never became an order."
        period={period}
        onPeriodChange={setPeriod}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !stats ? <SkeletonBlock /> : null}
      {stats ? (
        <>
          <div className={styles.statGrid}>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Abandoned carts</p>
              <p className={styles.statFigure}>{stats.abandonedCarts.count}</p>
              <p className={styles.statHint}>
                Active carts with items, idle more than {stats.abandonedCarts.olderThanHours} hours.
              </p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Discounted</p>
              <p className={styles.statFigure}>{money(stats.discounts.discountCents, stats.currency)}</p>
              <p className={styles.statHint}>
                {stats.discounts.ordersWithCode} order{stats.discounts.ordersWithCode === 1 ? '' : 's'} used a code.
              </p>
            </article>
          </div>

          <h3 className={styles.statGroupTitle}>Orders by status</h3>
          <StatusTable counts={stats.ordersByStatus} keys={[...ORDER_STATUSES]} empty="No orders in this period." />

          <h3 className={styles.statGroupTitle}>Payments</h3>
          {paymentSegments(stats.paymentsByStatus).length === 0 ? (
            <EmptyState title="No payment attempts in this period." compact />
          ) : (
            <div className={styles.statCard}>
              <StackedBar
                segments={paymentSegments(stats.paymentsByStatus)}
                total={Object.values(stats.paymentsByStatus).reduce((sum, value) => sum + value, 0)}
                formatValue={(value) => String(value)}
              />
            </div>
          )}

          {stats.paymentsByProvider.length > 0 ? (
            <DataTable aria-label="Payments by provider" density="compact">
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader scope="col">Provider</DataTableHeader>
                  <DataTableHeader scope="col">Attempts</DataTableHeader>
                  <DataTableHeader scope="col">Succeeded</DataTableHeader>
                  <DataTableHeader scope="col">Collected</DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {stats.paymentsByProvider.map((row) => (
                  <DataTableRow key={row.provider}>
                    <DataTableCell>{row.provider}</DataTableCell>
                    <DataTableCell>{row.attempts}</DataTableCell>
                    <DataTableCell>{row.succeeded}</DataTableCell>
                    <DataTableCell>{money(row.amountCents, stats.currency)}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : null}

          {stats.discounts.codes.length > 0 ? (
            <>
              <h3 className={styles.statGroupTitle}>Discount codes</h3>
              <DataTable aria-label="Discount codes" density="compact">
                <DataTableHead>
                  <DataTableRow>
                    <DataTableHeader scope="col">Code</DataTableHeader>
                    <DataTableHeader scope="col">Orders</DataTableHeader>
                    <DataTableHeader scope="col">Discounted</DataTableHeader>
                    <DataTableHeader scope="col">Revenue</DataTableHeader>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {stats.discounts.codes.map((row) => (
                    <DataTableRow key={row.code}>
                      <DataTableCell>{row.code}</DataTableCell>
                      <DataTableCell>{row.orders}</DataTableCell>
                      <DataTableCell>{money(row.discountCents, stats.currency)}</DataTableCell>
                      <DataTableCell>{money(row.revenueCents, stats.currency)}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function StatusTable({
  counts,
  keys,
  empty,
}: {
  counts: Record<string, number>
  keys: string[]
  empty: string
}) {
  const total = keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0)
  if (total === 0) return <EmptyState title={empty} compact />
  return (
    <DataTable aria-label="Orders by status" density="compact">
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader scope="col">Status</DataTableHeader>
          <DataTableHeader scope="col">Orders</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {keys.map((key) => (
          <DataTableRow key={key}>
            <DataTableCell>{key}</DataTableCell>
            <DataTableCell>{counts[key] ?? 0}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

function paymentSegments(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([label, value], index) => ({
      label,
      value,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }))
}
