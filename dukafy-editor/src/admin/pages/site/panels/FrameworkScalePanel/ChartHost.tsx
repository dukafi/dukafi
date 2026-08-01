import type { FluidScaleStep } from '@core/framework'
import type { GeneratorShape, GroupShape, ScaleAdapter } from './adapter'
import styles from './ChartHost.module.css'

interface ChartHostProps<G extends GroupShape, C extends GeneratorShape> {
  group: G
  adapter: ScaleAdapter<G, C>
  fluid: FluidScaleStep[]
  stepLabels: string[]
  baseScaleIndex: number
  largestSizeInScale: number
  onPrependStep: () => void
  onAppendStep: () => void
  onRemoveFirstStep: () => void
  onRemoveLastStep: () => void
}

/**
 * Mounted only when `adapter.renderChart` is supplied (e.g. Spacing's bar
 * chart). The host renders the adapter-supplied visualisation and forwards
 * step-add/remove callbacks; an adapter is free to embed `+ / −` buttons
 * directly inside its chart card. When the chart fully replaces the per-step
 * list, the controls have to live somewhere — this is that somewhere.
 */
export function ChartHost<G extends GroupShape, C extends GeneratorShape>({
  group,
  adapter,
  fluid,
  stepLabels,
  baseScaleIndex,
  largestSizeInScale,
  onPrependStep,
  onAppendStep,
  onRemoveFirstStep,
  onRemoveLastStep,
}: ChartHostProps<G, C>) {
  if (!adapter.renderChart || stepLabels.length === 0) return null
  return (
    <div className={styles.streamChartHost}>
      {adapter.renderChart({
        points: fluid.map((step, idx) => ({
          stepLabel: stepLabels[idx] ?? '',
          variableName: `--${group.namingConvention}-${stepLabels[idx] ?? ''}`,
          minPx: Number(step.min),
          maxPx: Number(step.max),
          isBase: idx === baseScaleIndex,
        })),
        maxInScale: largestSizeInScale,
        baseStepIndex: baseScaleIndex,
        onPrependStep,
        onAppendStep,
        onRemoveFirstStep,
        onRemoveLastStep,
        canRemoveStep: stepLabels.length > 1,
      })}
    </div>
  )
}
