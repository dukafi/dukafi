import { type InputHTMLAttributes, type Ref } from 'react'
import { cn } from '@ui/cn'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import styles from './Checkbox.module.css'

type BoxSize = 'sm' | 'md'

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  checked: boolean
  /** Fired with the next checked state when the user toggles the box. */
  onCheckedChange?: (checked: boolean) => void
  /** Visual size of the box. `sm` ≈ 12px, `md` ≈ 16px. Default `md`. */
  boxSize?: BoxSize
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLInputElement>
}

/**
 * Checkbox primitive — a native `<input type="checkbox">` styled to match the
 * editor's achromatic chrome. Returns a focusable inline element with the same
 * form semantics as a raw checkbox: it submits with forms, pairs with a
 * surrounding `<label>`, and exposes `checked`/`disabled` to assistive tech.
 *
 * The native input is visually hidden but kept in the accessibility tree;
 * the rendered box is a sibling `<span>` styled via `:checked` selectors.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  boxSize = 'md',
  className,
  disabled,
  onChange,
  ref,
  ...props
}: CheckboxProps) {
  const iconSize = boxSize === 'sm' ? 9 : 11
  return (
    <span className={cn(styles.checkbox, className)} data-size={boxSize}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className={styles.input}
        onChange={(event) => {
          onChange?.(event)
          if (!event.defaultPrevented) {
            onCheckedChange?.(event.currentTarget.checked)
          }
        }}
        {...props}
      />
      <span className={styles.box} aria-hidden="true">
        <CheckIcon size={iconSize} className={styles.check} />
      </span>
    </span>
  )
}
