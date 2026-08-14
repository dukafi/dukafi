import type { ReactNode } from 'react'
import { EmptyState } from '@ui/components/EmptyState'
import { Skeleton } from '@ui/components/Skeleton'
import { cn } from '@ui/cn'
import type { MediaBucket, MediaViewMode } from './mediaExplorerModel'
import styles from '../SiteExplorerPanel/SiteExplorerPanel.module.css'

interface MediaExplorerSectionProps {
  title: string
  bucket: MediaBucket
  viewMode: MediaViewMode
  count: number
  /**
   * `true` while the initial fetch is in flight. Renders skeleton
   * rows/tiles matching the loaded layout 1:1 (preview + label + meta)
   * so the swap is silent. We suppress the section's "0" count and the
   * "None yet" empty state while loading — the shimmer carries the
   * loading signal visually.
   */
  loading?: boolean
  uploadAction: ReactNode
  emptyLabel?: string
  children: ReactNode
}

// Per-section skeleton placeholder counts. The section is narrow (one
// column for rows, two columns for grid), so 3–4 placeholders read as
// "a small list is loading" without flooding the panel.
const SKELETON_ROW_COUNT = 3
const SKELETON_TILE_COUNT = 4

export function MediaExplorerSection({
  title,
  bucket,
  viewMode,
  count,
  loading = false,
  uploadAction,
  emptyLabel = 'None yet',
  children,
}: MediaExplorerSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={`media-section-${title.toLowerCase()}`}>
      <div className={styles.sectionHeader}>
        <h2 id={`media-section-${title.toLowerCase()}`} className={styles.sectionTitle}>
          {title}
        </h2>
        {/* Hide the "0" count during the initial load — the shimmer carries
            the loading signal; doubling it with a "0" count would imply
            "this bucket is empty" before we actually know. */}
        {!loading && <span className={styles.sectionCount}>{count}</span>}
        {uploadAction}
      </div>
      <div
        className={viewMode === 'grid' ? styles.mediaGrid : styles.rows}
        data-testid={viewMode === 'grid' ? `media-grid-${bucket}` : undefined}
        data-media-view={viewMode}
        aria-busy={loading || undefined}
      >
        {loading ? (
          viewMode === 'grid' ? (
            // Grid skeleton — mirrors `.mediaTile` (preview block + body
            // with label + meta) so the populated tile swaps in cleanly.
            Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
              <div
                key={`skeleton-tile-${i}`}
                className={styles.mediaTile}
                aria-hidden="true"
              >
                <span className={styles.mediaTilePreview}>
                  <Skeleton width="100%" height="100%" />
                </span>
                <span className={styles.mediaTileBody}>
                  <span className={styles.mediaTileLabel}>
                    <Skeleton width={`${60 + (i % 3) * 12}%`} height={11} />
                  </span>
                  <span className={styles.mediaTileMeta}>
                    <Skeleton width={56} height={9} />
                  </span>
                </span>
              </div>
            ))
          ) : (
            // List skeleton — mirrors `.mediaRow` (28x28 preview + label
            // + meta) so the loaded row footprint is preserved.
            Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
              <div
                key={`skeleton-row-${i}`}
                className={cn(styles.row, styles.mediaRow)}
                aria-hidden="true"
              >
                <span className={styles.mediaRowPreview}>
                  <Skeleton width="100%" height="100%" />
                </span>
                <span className={styles.rowLabel}>
                  <Skeleton width={`${50 + (i % 3) * 16}%`} height={11} />
                </span>
                <span className={styles.rowMeta}>
                  <Skeleton width={48} height={10} />
                </span>
              </div>
            ))
          )
        ) : count === 0 ? (
          <EmptyState
            compact
            title={emptyLabel}
            className={styles.sectionEmpty}
          />
        ) : children}
      </div>
    </section>
  )
}
