import { useState } from 'react'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { useCommerceStats } from '../hooks/useCommerceStats'
import { ORDER_STATUSES } from '../types'
import type { CommerceStats, CommerceStatsCollectionRow, CommerceStatsProductRow, StatsPeriod } from '../types'
import styles from '../DashboardPage.module.css'
import { PeriodHeader, StatCard, money } from './analytics/AnalyticsChrome'

export function AnalyticsOverviewSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading, error } = useCommerceStats(period)

  return (
    <div className={styles.section}>
      <PeriodHeader
        title="Overview"
        description="Settled orders, the products that earned, the pages that loaded, and how orders sit by status."
        period={period}
        onPeriodChange={setPeriod}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !stats ? <SkeletonBlock /> : null}
      {stats ? (
        <>
          <div className={styles.statGrid}>
            <StatCard
              label="Revenue"
              value={money(stats.overview.revenueCents, stats.currency)}
              deltaPct={stats.overview.deltas.revenuePct}
              series={stats.overview.series.revenue}
            />
            <StatCard
              label="Orders"
              value={String(stats.overview.orders)}
              deltaPct={stats.overview.deltas.ordersPct}
              series={stats.overview.series.orders}
            />
            <StatCard
              label="Average order"
              value={money(stats.overview.aovCents, stats.currency)}
              deltaPct={stats.overview.deltas.aovPct}
              series={stats.overview.series.revenue}
            />
            <StatCard
              label="Units"
              value={String(stats.overview.units)}
              deltaPct={stats.overview.deltas.unitsPct}
              series={stats.overview.series.units}
            />
          </div>

          <h3 className={styles.statGroupTitle}>Bestsellers</h3>
          <ProductTable products={stats.topProducts} currency={stats.currency} />

          <h3 className={styles.statGroupTitle}>Collections</h3>
          <CollectionTable collections={stats.topCollections} currency={stats.currency} />

          <h3 className={styles.statGroupTitle}>Pages</h3>
          <PathTable paths={stats.traffic.paths ?? []} />

          <h3 className={styles.statGroupTitle}>Orders by status</h3>
          <StatusTable counts={stats.ordersByStatus} />
        </>
      ) : null}
    </div>
  )
}

function ProductTable({
  products,
  currency,
}: {
  products: CommerceStatsProductRow[]
  currency: string
}) {
  if (products.length === 0) {
    return <EmptyState title="No product revenue in this period." compact />
  }
  return (
    <DataTable aria-label="Top products by revenue" density="compact">
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader scope="col">Product</DataTableHeader>
          <DataTableHeader scope="col">SKU</DataTableHeader>
          <DataTableHeader scope="col">Units</DataTableHeader>
          <DataTableHeader scope="col">Revenue</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {products.map((row) => (
          <DataTableRow key={`${row.sku}-${row.title}`}>
            <DataTableCell>{row.title}</DataTableCell>
            <DataTableCell>{row.sku}</DataTableCell>
            <DataTableCell>{row.units}</DataTableCell>
            <DataTableCell>{money(row.revenueCents, currency)}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

function CollectionTable({
  collections,
  currency,
}: {
  collections: CommerceStatsCollectionRow[]
  currency: string
}) {
  if (collections.length === 0) {
    return <EmptyState title="No collection revenue in this period." compact />
  }
  return (
    <DataTable aria-label="Top collections by revenue" density="compact">
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader scope="col">Collection</DataTableHeader>
          <DataTableHeader scope="col">Units</DataTableHeader>
          <DataTableHeader scope="col">Revenue</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {collections.map((row) => (
          <DataTableRow key={row.slug}>
            <DataTableCell>{row.title}</DataTableCell>
            <DataTableCell>{row.units}</DataTableCell>
            <DataTableCell>{money(row.revenueCents, currency)}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

function PathTable({ paths }: { paths: CommerceStats['traffic']['paths'] }) {
  if (paths.length === 0) {
    return <EmptyState title="No storefront page views in this period." compact />
  }
  return (
    <DataTable aria-label="Page views by path" density="compact">
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader scope="col">Path</DataTableHeader>
          <DataTableHeader scope="col">Views</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {paths.map((row) => (
          <DataTableRow key={row.path}>
            <DataTableCell>{row.path}</DataTableCell>
            <DataTableCell>{row.views}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

function StatusTable({ counts }: { counts: Record<string, number> }) {
  const keys = [...ORDER_STATUSES]
  const total = keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0)
  if (total === 0) return <EmptyState title="No orders in this period." compact />
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
