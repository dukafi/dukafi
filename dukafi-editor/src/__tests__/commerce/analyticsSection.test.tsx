import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { AnalyticsTrafficSection } from '@admin/pages/dashboard/sections/AnalyticsTrafficSection'
import { formatDelta, money } from '@admin/pages/dashboard/sections/analytics/AnalyticsChrome'

afterEach(cleanup)

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

describe('Traffic insights', () => {
  it('does not invent visitor numbers', () => {
    render(<AnalyticsTrafficSection />)
    expect(screen.getByTestId('analytics-traffic-empty').textContent).toContain('Page views are not tracked.')
    expect(screen.getByText(/baked HTML/i)).toBeDefined()
  })
})
