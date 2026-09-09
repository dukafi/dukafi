import { EmptyState } from '@ui/components/EmptyState'
import styles from '../DashboardPage.module.css'

export function AnalyticsTrafficSection() {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Traffic</h2>
          <p>Visitors and page views are not counted yet. The storefront is baked HTML served as static files, so the app never sees those hits.</p>
        </div>
      </div>
      <EmptyState
        title="Page views are not tracked."
        description="Revenue, orders, and bestsellers on the other Insights pages are exact — they come from the database. Counting visitors needs a first-party beacon that is off until it is built. Dukafi will not invent visitor numbers, and it will not send anyone to a third-party analytics product."
        data-testid="analytics-traffic-empty"
      />
    </div>
  )
}
