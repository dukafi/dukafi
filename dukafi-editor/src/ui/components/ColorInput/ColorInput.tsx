import {
  useState,
  type CSSProperties,
  type ChangeEvent,
  type InputHTMLAttributes,
  type Ref,
} from 'react'
import { cn } from '@ui/cn'
import { getColorInputValue, getColorSwatchValue } from './ColorInput.utils'
import styles from './ColorInput.module.css'

type ColorInputSize = 'xs' | 'sm' | 'md'

interface ColorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  fieldSize?: ColorInputSize
  swatchValue?: string
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLInputElement>
}

type ColorInputStyle = CSSProperties & { '--color-input-value'?: string }

export function ColorInput({
  className,
  fieldSize = 'sm',
  swatchValue,
  value,
  defaultValue,
  disabled,
  onChange,
  style,
  ref,
  ...props
}: ColorInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(getColorInputValue(defaultValue))
  const currentValue = value === undefined
    ? uncontrolledValue
    : getColorInputValue(value)
  const displayValue = getColorSwatchValue(swatchValue ?? currentValue)
  const frameStyle: ColorInputStyle = {
    ...style,
    '--color-input-value': displayValue,
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (value === undefined) {
      setUncontrolledValue(event.target.value)
    }
    onChange?.(event)
  }

  return (
    <span
      className={cn(
        styles.colorInput,
        styles[`size-${fieldSize}`],
        disabled && styles.disabled,
        className,
      )}
      style={frameStyle}
    >
      <span className={styles.preview} aria-hidden="true" />
      <input
        {...props}
        ref={ref}
        type="color"
        value={currentValue}
        disabled={disabled}
        onChange={handleChange}
        className={styles.nativeInput}
      />
    </span>
  )
}
