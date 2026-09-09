import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { AnalyticsOverviewSection } from '@admin/pages/dashboard/sections/AnalyticsOverviewSection'
import { AnalyticsTrafficSection } from '@admin/pages/dashboard/sections/AnalyticsTrafficSection'
import { formatDelta, money } from '@admin/pages/dashboard/sections/analytics/AnalyticsChrome'
import type { CommerceStats } from '@admin/pages/dashboard/types'

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

const originalFetch = globalThis.fetch

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyOverview(): CommerceStats['overview'] {
  return {
    revenueCents: 0,
    orders: 0,
    aovCents: 0,
    units: 0,
    previous: { revenueCents: 0, orders: 0, aovCents: 0, units: 0 },
    deltas: { revenuePct: null, ordersPct: null, aovPct: null, unitsPct: null },
    series: { revenue: [], orders: [], units: [] },
  }
}

function statsPayload(traffic: CommerceStats['traffic']): CommerceStats {
  return {
    period: '30d',
    currency: 'KES',
    overview: emptyOverview(),
    ordersByStatus: {},
    paymentsByStatus: {},
    paymentsByProvider: [],
    topProducts: [],
    topCollections: [],
    abandonedCarts: { count: 0, olderThanHours: 24 },
    discounts: { ordersWithCode: 0, discountCents: 0, revenueCents: 0, codes: [] },
    traffic,
  }
}

function stubStats(traffic: CommerceStats['traffic'], extra: Partial<CommerceStats> = {}) {
  globalThis.fetch = (async () => json({ stats: { ...statsPayload(traffic), ...extra } })) as typeof fetch
}

describe('Commerce stats chrome', () => {
  it('formats money in the store currency', () => {
    expect(money(27900, 'KES')).toBe('KES 279.00')
    expect(money(13950, 'USD')).toBe('$139.50')
  })

  it('formats growth without inventing a direction for a flat or empty window', () => {
    expect(formatDelta(12.5)).toBe('+12.5%')
    expect(formatDelta(-3)).toBe('-3%')
    expect(formatDelta(0)).toBe('0%')
    expect(formatDelta(null)).toBe('—')
  })
})

describe('Overview insights', () => {
  it('shows bestsellers, pages, and order status as tables under the scoreboard', async () => {
    stubStats(
      {
        available: true,
        pageViews: 9,
        previous: { pageViews: 3 },
        deltas: { pageViewsPct: 200 },
        series: { pageViews: [3, 6] },
        paths: [{ path: '/', views: 6 }, { path: '/about', views: 3 }],
      },
      {
        overview: {
          revenueCents: 15000,
          orders: 2,
          aovCents: 7500,
          units: 3,
          previous: { revenueCents: 0, orders: 0, aovCents: 0, units: 0 },
          deltas: { revenuePct: 100, ordersPct: 100, aovPct: 100, unitsPct: 100 },
          series: { revenue: [15000], orders: [2], units: [3] },
        },
        topProducts: [{ title: 'Notebook', sku: 'NB-1', revenueCents: 15000, units: 3 }],
        topCollections: [{ title: 'Featured', slug: 'featured', revenueCents: 15000, units: 3 }],
        ordersByStatus: { pending: 0, paid: 2, fulfilled: 0, shipped: 0, refunded: 0 },
      },
    )
    render(<AnalyticsOverviewSection />)
    await waitFor(() => expect(screen.getByText('Notebook')).toBeDefined())
    expect(screen.getByRole('table', { name: 'Top products by revenue' })).toBeDefined()
    expect(screen.getByRole('table', { name: 'Top collections by revenue' })).toBeDefined()
    expect(screen.getByRole('table', { name: 'Page views by path' })).toBeDefined()
    expect(screen.getByRole('table', { name: 'Orders by status' })).toBeDefined()
    expect(screen.getByText('/about')).toBeDefined()
    expect(screen.getByText('Featured')).toBeDefined()
  })
})

describe('Traffic insights', () => {
  it('does not invent visitor numbers when no pages were loaded', async () => {
    stubStats({
      available: true,
      pageViews: 0,
      previous: { pageViews: 0 },
      deltas: { pageViewsPct: null },
      series: { pageViews: [] },
      paths: [],
    })
    render(<AnalyticsTrafficSection />)
    await waitFor(() => expect(screen.getByTestId('analytics-traffic-empty').textContent).toContain('No storefront page views'))
    expect(screen.queryByText('Unique visitors')).toBeNull()
  })

  it('shows counted page views and paths', async () => {
    stubStats({
      available: true,
      pageViews: 9,
      previous: { pageViews: 3 },
      deltas: { pageViewsPct: 200 },
      series: { pageViews: [3, 6] },
      paths: [{ path: '/', views: 6 }, { path: '/about', views: 3 }],
    })
    render(<AnalyticsTrafficSection />)
    await waitFor(() => expect(screen.getByText('Page views')).toBeDefined())
    expect(screen.getByText('9')).toBeDefined()
    expect(screen.getByText('/about')).toBeDefined()
    expect(screen.queryByText('Unique visitors')).toBeNull()
  })
})
