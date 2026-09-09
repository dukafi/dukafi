import { Select } from '@ui/components/Select'
import { Delta, Sparkline, StatValue } from '@ui/components/charts'
import type { StatsPeriod } from '../../types'
import styles from '../../DashboardPage.module.css'

export const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export function money(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`
}

export function formatDelta(pct: number | null): string {
  if (pct == null) return '—'
  if (pct === 0) return '0%'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}

export function PeriodHeader({
  title,
  description,
  period,
  onPeriodChange,
}: {
  title: string
  description: string
  period: StatsPeriod
  onPeriodChange: (period: StatsPeriod) => void
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Select
        id="analytics-period"
        aria-label="Period"
        value={period}
        options={PERIOD_OPTIONS}
        fieldSize="sm"
        searchable={false}
        onChange={(event) => onPeriodChange(event.currentTarget.value as StatsPeriod)}
      />
    </div>
  )
}

export function StatCard({
  label,
  value,
  deltaPct,
  series,
}: {
  label: string
  value: string
  deltaPct: number | null
  series: number[]
}) {
  return (
    <article className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <StatValue
        value={value}
        delta={<Delta>{formatDelta(deltaPct)}</Delta>}
        sub="vs previous period"
      />
      <Sparkline data={series} tint="var(--text-bright)" ariaLabel={`${label} over the period`} />
    </article>
  )
}
