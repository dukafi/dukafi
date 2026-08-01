/**
 * Pagination — plain rows-per-page + "X–Y of Z" + prev/next footer.
 * Client-side only: every list a Commerce tab paginates is already fetched
 * in full (small-store scale — see VISION.md), so no server paging exists
 * or is needed yet.
 */
import { Button } from '@ui/components/Button'
import { Select } from '@ui/components/Select'
import { ChevronLeftIcon } from 'pixel-art-icons/icons/chevron-left'
import { ChevronRightIcon } from 'pixel-art-icons/icons/chevron-right'
import styles from '../CommercePage.module.css'

const ROWS_PER_PAGE_OPTIONS = [
  { value: '25', label: '25', textValue: '25' },
  { value: '50', label: '50', textValue: '50' },
  { value: '100', label: '100', textValue: '100' },
]

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1)
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className={styles.pagination}>
      <label className={styles.paginationRows}>
        <span>Rows</span>
        <Select
          aria-label="Rows per page"
          value={String(pageSize)}
          options={ROWS_PER_PAGE_OPTIONS}
          fieldSize="sm"
          onChange={(event) => onPageSizeChange(Number(event.currentTarget.value))}
        />
      </label>
      <span className={styles.paginationRange}>{start} – {end} of {total}</span>
      <Button type="button" variant="ghost" size="xs" iconOnly aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeftIcon size={13} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="xs" iconOnly aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        <ChevronRightIcon size={13} aria-hidden="true" />
      </Button>
    </div>
  )
}
