import type { ReactNode } from 'react'
import styles from '../AccountPage.module.css'

interface SecurityCardProps {
  title: string
  description: string
  status: string
  statusActive?: boolean
  action: ReactNode
  testId: string
}

export function SecurityCard({
  title,
  description,
  status,
  statusActive = false,
  action,
  testId,
}: SecurityCardProps) {
  return (
    <div className={styles.card} data-testid={testId}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardDesc}>{description}</p>
        </div>
        <div className={styles.cardActions}>{action}</div>
      </div>
      <p
        className={
          statusActive
            ? `${styles.cardStatus} ${styles.cardStatusActive}`
            : styles.cardStatus
        }
        role="status"
      >
        {status}
      </p>
    </div>
  )
}
