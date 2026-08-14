import type { ControlProps } from './shared'
import { Switch } from '@ui/components/Switch'
import { cn } from '@ui/cn'
import controlRowStyles from '@ui/components/ControlRow/ControlRow.module.css'
import styles from './controls.module.css'

export function ToggleControl({
  propKey,
  value,
  onChange,
  label,
  isOverride,
  disabled,
}: ControlProps<boolean>) {
  const checked = Boolean(value)

  return (
    <div
      className={cn(
        controlRowStyles.controlWrapper,
        styles.toggleWrapper,
        disabled && controlRowStyles.controlWrapperDisabled,
      )}
    >
      <label
        htmlFor={`ctrl-${propKey}`}
        className={cn(
          styles.toggleLabel,
          disabled && styles.toggleLabelDisabled,
          isOverride && styles.toggleLabelOverride,
        )}
      >
        {label ?? propKey}
      </label>

      <Switch
        id={`ctrl-${propKey}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(propKey, next)}
      />
    </div>
  )
}
