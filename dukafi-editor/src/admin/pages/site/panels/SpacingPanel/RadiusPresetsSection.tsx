/**
 * Site corner radius. One slider paints buttons, inputs, images, articles,
 * and divs via --radius. Tailwind rounded-* on a selected element still wins.
 */
import { useEditorStore } from '@site/store/store'
import { RADIUS_STEPS, resolveSpacingPresets, type RadiusStep } from '@core/framework'
import { DiscreteSlider } from './SpacingPresetsSection'
import styles from './SpacingPresetsSection.module.css'

const RADIUS_LABELS: Record<RadiusStep, string> = {
  none: 'None',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  full: 'Rounded',
}

export function RadiusPresetsSection() {
  const spacing = useEditorStore((s) => s.site?.settings.framework?.spacing)
  const updateFrameworkSpacingPresets = useEditorStore((s) => s.updateFrameworkSpacingPresets)
  const presets = resolveSpacingPresets(spacing)

  return (
    <div className={styles.root} data-testid="radius-presets">
      <p className={styles.hint}>
        Default corners for buttons, inputs, images, cards, and divs. Properties
        or Tailwind on a selected element override it.
      </p>
      <DiscreteSlider
        label="Radius"
        value={presets.radius}
        options={RADIUS_STEPS.map((value) => ({
          value,
          label: RADIUS_LABELS[value],
        }))}
        onChange={(radius) => updateFrameworkSpacingPresets({ radius })}
      />
    </div>
  )
}
