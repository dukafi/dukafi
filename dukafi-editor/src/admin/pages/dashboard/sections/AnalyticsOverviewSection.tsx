import { useState } from 'react'
import { EmptyState } from '@ui/components/EmptyState'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { useCommerceStats } from '../hooks/useCommerceStats'
import type { StatsPeriod } from '../types'
import styles from '../DashboardPage.module.css'
import { PeriodHeader, StatCard, money } from './analytics/AnalyticsChrome'

export function AnalyticsOverviewSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading, error } = useCommerceStats(period)

  return (
    <div className={styles.section}>
      <PeriodHeader
        title="Overview"
        description="What the store actually earned. Paid, fulfilled, and shipped orders — not pending, not refunded."
        period={period}
        onPeriodChange={setPeriod}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !stats ? (
        <SkeletonBlock />
      ) : !stats || (stats.overview.orders === 0 && stats.overview.revenueCents === 0) ? (
        <EmptyState
          title="No settled orders in this period."
          description="Pending checkouts do not count. Figures appear here once a payment succeeds."
        />
      ) : (
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
      )}
    </div>
  )
}
