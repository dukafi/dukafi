import { Input } from '@ui/components/Input'

/**
 * Compact numeric field used by the fluid base settings, manual sizes, and
 * custom-ratio fallback. Wraps the shared `Input` primitive so the unit and
 * spinner affordances live in one place — value parsing tolerates blanks
 * (the user is mid-edit) and ignores non-finite values.
 */
export function NumericInput({
  value,
  onChange,
  ariaLabel,
  unit,
  inputId,
}: {
  value: number
  onChange: (next: number) => void
  ariaLabel: string
  unit?: string
  inputId?: string
}) {
  return (
    <Input
      id={inputId}
      fieldSize="sm"
      aria-label={ariaLabel}
      type="number"
      step="0.1"
      unit={unit}
      value={Number.isFinite(value) ? String(value) : ''}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
    />
  )
}
