/**
 * Commerce stats for the Insights pages.
 *
 * Separate from `useCommerceData` — that hook already loads every product and
 * order for the operational tables. These screens need the aggregated
 * scoreboard, not the raw rows.
 */
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import type { CommerceStats, StatsPeriod } from '../types'

export function useCommerceStats(period: StatsPeriod) {
  const [stats, setStats] = useState<CommerceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    commerceApi.stats(period)
      .then((payload) => {
        if (!cancelled) setStats(payload.stats)
      })
      .catch((cause) => {
        if (!cancelled) {
          setStats(null)
          setError(getErrorMessage(cause, 'Could not load stats'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [period])

  return { stats, loading, error }
}
