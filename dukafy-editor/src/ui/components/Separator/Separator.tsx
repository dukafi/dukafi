import { type HTMLAttributes, type Ref } from 'react'
import { cn } from '@ui/cn'
import styles from './Separator.module.css'

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  spacing?: 'none' | 'compact' | 'normal'
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLDivElement>
}

export function Separator({
  orientation = 'horizontal',
  decorative = true,
  spacing = 'normal',
  className,
  ref,
  ...props
}: SeparatorProps) {
  return (
    <div
      ref={ref}
      role={decorative ? undefined : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      aria-hidden={decorative ? true : undefined}
      data-orientation={orientation}
      data-spacing={spacing}
      className={cn(styles.separator, className)}
      {...props}
    />
  )
}
