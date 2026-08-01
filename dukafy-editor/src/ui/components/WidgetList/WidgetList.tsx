/**
 * WidgetList — list-style body content for dashboard widget tiles.
 *
 * Pairs a "primary" cell on the left (typically a path / title / user) with
 * a "meta" cell on the right (typically a count, badge, delta, or a stack of
 * the three). Each row is rendered with a thin top border so multiple
 * rows stack like a ledger.
 *
 * Use inside a `Widget` body when the widget is presenting a sorted list
 * of items (Top Pages, Publish Queue, Activity, plugin-specific lists).
 * The Widget chrome supplies the title row, padding, and tint — this
 * primitive owns the row layout + typography only.
 *
 *   <Widget {...}>
 *     <WidgetList>
 *       {pages.map((p) => (
 *         <WidgetListRow
 *           key={p.path}
 *           primary={<span>{p.path}</span>}
 *           meta={(<><span>{p.views}</span><Delta>{p.delta}</Delta></>)}
 *         />
 *       ))}
 *     </WidgetList>
 *   </Widget>
 *
 * Lives under `src/ui/components/` so first-party widgets and plugin
 * widgets render with identical row styling. Exported via
 * `@instatic/host-ui` so plugins drop their data straight in.
 */
import type { ReactNode } from 'react'
import styles from './WidgetList.module.css'

export interface WidgetListProps {
  children?: ReactNode
}

export function WidgetList({ children }: WidgetListProps) {
  return <ul className={styles.list}>{children}</ul>
}

export interface WidgetListRowProps {
  /**
   * Left cell — usually a path, page title, user name, or other primary
   * label. Truncates with ellipsis when narrower than the column.
   */
  primary: ReactNode
  /**
   * Right cell — numbers, badges, or a small inline group of both. Stays
   * in mono font so columns of numbers line up. Composes with `Delta`
   * from `@instatic/host-ui` for trend indicators.
   */
  meta?: ReactNode
}

export function WidgetListRow({ primary, meta }: WidgetListRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.primary}>{primary}</span>
      {meta !== undefined && <span className={styles.meta}>{meta}</span>}
    </li>
  )
}
