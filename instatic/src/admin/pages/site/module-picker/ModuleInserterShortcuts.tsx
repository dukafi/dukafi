import { Kbd } from '@ui/components/Kbd'
import styles from './ModuleInserterDialog.module.css'

export function ModuleInserterShortcuts() {
  return (
    <div
      className={styles.shortcutFooter}
      aria-label="Module inserter keyboard shortcuts"
    >
      <div className={styles.shortcutHint}>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        <span>navigate</span>
      </div>
      <div className={styles.shortcutHint}>
        <Kbd>←</Kbd>
        <span>categories</span>
        <Kbd>↵</Kbd>
        <span>add</span>
      </div>
      <div className={styles.shortcutHint}>
        <Kbd>/</Kbd>
        <span>search</span>
        <Kbd>drag</Kbd>
        <span>to canvas</span>
      </div>
    </div>
  )
}
