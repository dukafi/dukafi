import { EmptyState } from '@ui/components/EmptyState'
import { Input } from '@ui/components/Input'
import { NumericInput } from './controls/NumericInput'
import type { GeneratorShape, GroupShape, ScaleAdapter } from './adapter'
import styles from './ManualEditor.module.css'

/**
 * "Manual" branch of the mode toggle — the user authors per-row variable
 * names and explicit min/max px values, no scale math involved. The Class
 * Generator lives outside this component (in the Utilities Section) so it
 * applies equally to fluid + manual scales.
 */
export function ManualEditor<G extends GroupShape, C extends GeneratorShape>({
  group,
  adapter,
}: {
  group: G
  adapter: ScaleAdapter<G, C>
}) {
  const items = group.manualSizes ?? []
  return (
    <div className={styles.manualList}>
      {items.length === 0 ? (
        <EmptyState plain compact title="No manual sizes yet." />
      ) : (
        items.map((size) => (
          <div key={size.id} className={styles.manualRow}>
            <Input
              fieldSize="sm"
              aria-label="Variable name"
              value={size.name}
              onChange={(event) =>
                adapter.onUpsertManualSize(group.id, size.id, { name: event.target.value })
              }
              monospace
            />
            <NumericInput
              value={size.min}
              ariaLabel="Min size"
              onChange={(next) => adapter.onUpsertManualSize(group.id, size.id, { min: next })}
              unit="px"
            />
            <NumericInput
              value={size.max}
              ariaLabel="Max size"
              onChange={(next) => adapter.onUpsertManualSize(group.id, size.id, { max: next })}
              unit="px"
            />
          </div>
        ))
      )}
    </div>
  )
}
