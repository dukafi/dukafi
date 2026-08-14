import type { ControlProps } from './shared'
import { Textarea } from '@ui/components/Input'
import { ControlRow } from '@ui/components/ControlRow'

interface TextareaControlProps extends ControlProps<string> {
  rows?: number
  placeholder?: string
}

export function TextareaControl({
  propKey,
  value,
  onChange,
  label,
  rows = 3,
  placeholder,
  isOverride,
  disabled,
  layout,
}: TextareaControlProps) {
  return (
    <ControlRow
      propKey={propKey}
      label={label}
      layout={layout}
      isOverride={isOverride}
      disabled={disabled}
    >
      <Textarea
        id={`ctrl-${propKey}`}
        value={value ?? ''}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(propKey, e.target.value)}
      />
    </ControlRow>
  )
}
