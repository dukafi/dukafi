import { useState } from 'react'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { EmptyState } from '@ui/components/EmptyState'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { useCommerceStats } from '../hooks/useCommerceStats'
import type { StatsPeriod } from '../types'
import styles from '../DashboardPage.module.css'
import { PeriodHeader, StatCard } from './analytics/AnalyticsChrome'

export function AnalyticsTrafficSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading, error } = useCommerceStats(period)
  const traffic = stats?.traffic

  return (
    <div className={styles.section}>
      <PeriodHeader
        title="Traffic"
        description="Successful HTML page loads the storefront served. Assets, admin, and missing pages are not counted. Dukafi does not infer an audience from these loads."
        period={period}
        onPeriodChange={setPeriod}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !stats ? <SkeletonBlock /> : null}
      {traffic && traffic.pageViews === 0 ? (
        <EmptyState
          title="No storefront page views in this period."
          description="A view is counted when the storefront returns HTML for a published page. CSS, robots.txt, sitemaps, and 404s are left out. Dukafi does not invent unique-visitor numbers."
          data-testid="analytics-traffic-empty"
        />
      ) : traffic ? (
        <>
          <div className={styles.statGrid}>
            <StatCard
              label="Page views"
              value={String(traffic.pageViews)}
              deltaPct={traffic.deltas.pageViewsPct}
              series={traffic.series.pageViews}
            />
          </div>
          <h3 className={styles.statGroupTitle}>Pages</h3>
          {traffic.paths.length === 0 ? (
            <EmptyState title="No paths recorded in this period." compact />
          ) : (
            <DataTable aria-label="Page views by path" density="compact" data-testid="analytics-traffic-paths">
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader scope="col">Path</DataTableHeader>
                  <DataTableHeader scope="col">Views</DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {traffic.paths.map((row) => (
                  <DataTableRow key={row.path}>
                    <DataTableCell>{row.path}</DataTableCell>
                    <DataTableCell>{row.views}</DataTableCell>
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
