import { useState } from 'react'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { useCommerceStats } from '../hooks/useCommerceStats'
import type { StatsPeriod } from '../types'
import styles from '../DashboardPage.module.css'
import { PeriodHeader, money } from './analytics/AnalyticsChrome'

export function AnalyticsProductsSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading, error } = useCommerceStats(period)

  return (
    <div className={styles.section}>
      <PeriodHeader
        title="Bestsellers"
        description="Ranked by revenue, not units. A cheap SKU that sells many times still sits below one expensive one."
        period={period}
        onPeriodChange={setPeriod}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !stats ? <SkeletonBlock /> : null}
      {stats ? (
        <>
          <h3 className={styles.statGroupTitle}>Products</h3>
          {stats.topProducts.length === 0 ? (
            <EmptyState title="No product revenue in this period." compact />
          ) : (
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
                {stats.topProducts.map((row) => (
                  <DataTableRow key={`${row.sku}-${row.title}`}>
                    <DataTableCell>{row.title}</DataTableCell>
                    <DataTableCell>{row.sku}</DataTableCell>
                    <DataTableCell>{row.units}</DataTableCell>
                    <DataTableCell>{money(row.revenueCents, stats.currency)}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}

          <h3 className={styles.statGroupTitle}>Collections</h3>
          {stats.topCollections.length === 0 ? (
            <EmptyState
              title="No collection revenue in this period."
              description="A product has to sit in a collection for that collection to rank here."
              compact
            />
          ) : (
            <DataTable aria-label="Top collections by revenue" density="compact">
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader scope="col">Collection</DataTableHeader>
                  <DataTableHeader scope="col">Units</DataTableHeader>
                  <DataTableHeader scope="col">Revenue</DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {stats.topCollections.map((row) => (
                  <DataTableRow key={row.slug}>
                    <DataTableCell>{row.title}</DataTableCell>
                    <DataTableCell>{row.units}</DataTableCell>
                    <DataTableCell>{money(row.revenueCents, stats.currency)}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </>
      ) : null}
    </div>
  )
}
