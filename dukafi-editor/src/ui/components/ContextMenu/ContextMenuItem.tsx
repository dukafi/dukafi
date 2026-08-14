import { type Ref } from 'react'
import { Button, type ButtonProps } from '@ui/components/Button'
import { Separator } from '@ui/components/Separator'
import { cn } from '@ui/cn'
import styles from './ContextMenu.module.css'

interface ContextMenuItemProps extends Omit<ButtonProps, 'variant' | 'size' | 'menuItem' | 'tone' | 'ref'> {
  danger?: boolean
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLButtonElement>
}

export function ContextMenuItem({
  danger = false,
  className,
  children,
  ref,
  ...props
}: ContextMenuItemProps) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="xs"
      menuItem
      role="menuitem"
      tone={danger ? 'danger' : 'default'}
      className={cn(styles.item, className)}
      {...props}
    >
      {children}
    </Button>
  )
}

export function ContextMenuSeparator() {
  return <Separator spacing="compact" className={styles.separator} />
}
