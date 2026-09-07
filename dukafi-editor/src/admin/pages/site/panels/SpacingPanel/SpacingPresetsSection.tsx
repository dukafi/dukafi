/**
 * Relume-style discrete spacing defaults. Four semantic sliders — container
 * width, card padding, vertical, horizontal — that write CSS variables.
 */
import { type CSSProperties, type ReactNode } from 'react'
import { useEditorStore } from '@site/store/store'
import {
  CARD_PADDING_STEPS,
  CONTAINER_WIDTH_STEPS,
  resolveSpacingPresets,
  SPACE_STEPS,
  type CardPaddingStep,
  type ContainerWidthStep,
  type SpaceStep,
} from '@core/framework'
import styles from './SpacingPresetsSection.module.css'

const CONTAINER_LABELS: Record<ContainerWidthStep, string> = {
  narrow: 'Narrow',
  regular: 'Regular',
  wide: 'Wide',
}

const CARD_LABELS: Record<CardPaddingStep, string> = {
  tight: 'Tight',
  regular: 'Regular',
  roomy: 'Roomy',
}

const SPACE_LABELS: Record<SpaceStep, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
}

export function DiscreteSlider<T extends string>({
  label,
  value,
  options,
  onChange,
  trailing,
  disabled = false,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  trailing?: ReactNode
  disabled?: boolean
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const current = options[index] ?? options[0]!
  const progress = options.length <= 1 ? 0 : (index / (options.length - 1)) * 100

  function stopPanelDrag(event: { stopPropagation: () => void }) {
    event.stopPropagation()
  }

  return (
    <div className={trailing ? styles.rowWithAction : styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.control}>
        <span
          className={styles.tooltip}
          style={{ '--slider-progress': `${progress}%` } as CSSProperties}
        >
          {current.label}
        </span>
        <div className={styles.dots} aria-hidden="true">
          {options.map((option, i) => (
            <span
              key={option.value}
              className={styles.dot}
              data-active={i === index ? 'true' : undefined}
            />
          ))}
        </div>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={options.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={current.label}
          onPointerDown={stopPanelDrag}
          onMouseDown={stopPanelDrag}
          onInput={(event) => {
            const next = options[Number(event.currentTarget.value)]
            if (next) onChange(next.value)
          }}
        />
      </div>
      {trailing}
    </div>
  )
}

export function SpacingPresetsSection() {
  const spacing = useEditorStore((s) => s.site?.settings.framework?.spacing)
  const updateFrameworkSpacingPresets = useEditorStore((s) => s.updateFrameworkSpacingPresets)
  const presets = resolveSpacingPresets(spacing)

  return (
    <div className={styles.root} data-testid="spacing-presets">
      <p className={styles.hint}>
        Site layout defaults. Properties or Tailwind on a selected element override them.
      </p>
      <DiscreteSlider
        label="Container Width"
        value={presets.containerWidth}
        options={CONTAINER_WIDTH_STEPS.map((value) => ({
          value,
          label: CONTAINER_LABELS[value],
        }))}
        onChange={(containerWidth) => updateFrameworkSpacingPresets({ containerWidth })}
      />
      <DiscreteSlider
        label="Card Padding"
        value={presets.cardPadding}
        options={CARD_PADDING_STEPS.map((value) => ({
          value,
          label: CARD_LABELS[value],
        }))}
        onChange={(cardPadding) => updateFrameworkSpacingPresets({ cardPadding })}
      />
      <DiscreteSlider
        label="Vertical"
        value={presets.vertical}
        options={SPACE_STEPS.map((value) => ({
          value,
          label: SPACE_LABELS[value],
        }))}
        onChange={(vertical) => updateFrameworkSpacingPresets({ vertical })}
      />
      <DiscreteSlider
        label="Horizontal"
        value={presets.horizontal}
        options={SPACE_STEPS.map((value) => ({
          value,
          label: SPACE_LABELS[value],
        }))}
        onChange={(horizontal) => updateFrameworkSpacingPresets({ horizontal })}
      />
    </div>
  )
}
