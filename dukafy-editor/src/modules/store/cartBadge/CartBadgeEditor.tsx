import type { ModuleComponentProps } from '@core/module-engine'
import type { CartBadgeProps } from './props'
import './cartBadge.css'

export function CartBadgeEditor({ props, mcClassName, nodeWrapperProps }: ModuleComponentProps<CartBadgeProps>) {
  return (
    <a {...nodeWrapperProps} className={['dukafy-cart-badge', mcClassName].filter(Boolean).join(' ')} href={props.href} onClick={event => event.preventDefault()} aria-label={`${props.label}: 0 items`}>
      {props.label} <span className="dukafy-cart-badge__count">0</span>
    </a>
  )
}
