/**
 * SpotlightSkeleton — shimmer placeholder rows for async provider results.
 *
 * Phase 3 §D: shown 240ms after a provider enters loadingProviders so fast
 * responses never produce a flash. The decision of when to render the skeleton
 * lives in SpotlightResults; this component is a pure presentational layer.
 *
 * - 6 placeholder rows with a horizontal shimmer sweep animation.
 * - Respects prefers-reduced-motion (animation disabled, static fill used).
 * - Accepts a `label` prop that becomes the group header shown to the user.
 */

import type { ReactNode } from 'react'
import styles from './SpotlightSkeleton.module.css'

const ROW_COUNT = 6

interface SpotlightSkeletonProps {
  /** Text shown as the group header above the shimmer rows. */
  label: string
}

export function SpotlightSkeleton({ label }: SpotlightSkeletonProps): ReactNode {
  return (
    <div role="group" aria-label={label} aria-busy="true">
      <div className={styles.groupHeader} aria-hidden="true">
        <span className={styles.groupBar} />
        <span className={styles.groupTitle}>{label}</span>
      </div>
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <div key={i} className={styles.row} aria-hidden="true">
          <div className={styles.iconPlaceholder} />
          <div className={styles.content}>
            <div className={styles.titlePlaceholder} />
            <div className={styles.subtitlePlaceholder} />
          </div>
        </div>
      ))}
    </div>
  )
}
