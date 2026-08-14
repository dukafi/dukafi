import { type RefObject } from 'react'
import { Select } from '@ui/components/Select'
import { NumericInput } from './NumericInput'

/**
 * Renders just the ratio input — `Select` for preset ratios, `NumericInput`
 * when the "use custom" mode is on. The toggle that flips between modes lives
 * next to the field's *label* (passed to ControlRow's `labelSuffix` slot) so
 * it never eats horizontal space inside the input row.
 */
export function RatioField({
  scaleRatio,
  isCustom,
  customValue,
  options,
  ariaLabel,
  onChange,
  inputId,
  menuAnchorRef,
}: {
  scaleRatio: number | string
  isCustom?: boolean
  customValue?: number
  options: ReadonlyArray<{ value: string; label: string }>
  ariaLabel: string
  inputId?: string
  /**
   * Optional element whose width determines the dropdown's horizontal span.
   * Lets the menu reach across both columns of the parent grid so long
   * ratio labels (e.g. "Augmented Fourth (1.414...)") stay readable instead
   * of being clipped to the trigger's narrow column width.
   */
  menuAnchorRef?: RefObject<HTMLElement | null>
  onChange: (patch: {
    scaleRatio?: number | string
    isCustomScaleRatio?: boolean
    scaleRatioInputValue?: number
  }) => void
}) {
  if (isCustom) {
    return (
      <NumericInput
        inputId={inputId}
        value={customValue ?? Number(scaleRatio)}
        ariaLabel={`Custom ${ariaLabel.toLowerCase()}`}
        onChange={(next) => onChange({ scaleRatioInputValue: next })}
      />
    )
  }
  return (
    <Select
      id={inputId}
      fieldSize="sm"
      aria-label={ariaLabel}
      value={String(scaleRatio)}
      menuAnchorRef={menuAnchorRef}
      options={options.map((option) => ({ value: option.value, label: option.label }))}
      onChange={(event) => onChange({ scaleRatio: Number(event.currentTarget.value) })}
    />
  )
}
