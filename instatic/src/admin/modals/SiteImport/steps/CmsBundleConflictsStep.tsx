import type { BundleRowConflict } from '@core/data/bundleSchema'
import type { ConflictResolution } from '@core/siteImport'
import {
  cmsRowConflictKey,
  defaultCmsRowConflictResolution,
} from '../shared/cmsBundleFlow'
import { ConflictRow } from '../shared/ConflictRow'
import styles from './ConflictsStep.module.css'

interface CmsBundleConflictsStepProps {
  conflicts: BundleRowConflict[]
  resolutions: Map<string, ConflictResolution>
  onResolutionChange: (key: string, resolution: ConflictResolution) => void
}

export function CmsBundleConflictsStep({
  conflicts,
  resolutions,
  onResolutionChange,
}: CmsBundleConflictsStepProps) {
  if (conflicts.length === 0) return null

  return (
    <div className={styles.wrapper}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.heading}>
            Row slug conflicts ({conflicts.length})
          </h3>
        </div>
        <p className={styles.hint}>
          These imported rows use a slug that already exists in the target table.
          Rename the imported row or skip it before continuing.
        </p>
        <div className={styles.rows}>
          {conflicts.map((conflict) => {
            const key = cmsRowConflictKey(conflict)
            return (
              <ConflictRow
                key={key}
                kind="page"
                source={`${conflict.tableName} · ${conflict.rowTitle}`}
                desired={conflict.slug}
                current={resolutions.get(key) ?? defaultCmsRowConflictResolution(conflict)}
                canOverwrite={false}
                onChange={(next) => onResolutionChange(key, next)}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
