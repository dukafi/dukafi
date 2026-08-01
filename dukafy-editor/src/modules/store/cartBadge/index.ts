import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { CartBadgeEditor } from './CartBadgeEditor'
import { CartBadgePropsSchema, type CartBadgeProps } from './props'

export const CartBadgeModule: ModuleDefinition<CartBadgeProps> = {
  id: 'store.cart-badge',
  name: 'Cart badge',
  description: 'A live session-cart item count that refreshes after cart changes.',
  category: 'Commerce',
  version: '1.0.0',
  icon: PackageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    label: { type: 'text', label: 'Label' },
    href: { type: 'url', label: 'Cart link' },
  },
  propsSchema: CartBadgePropsSchema,
  defaults: Value.Create(CartBadgePropsSchema),
  component: CartBadgeEditor,
  htmlTag: 'a',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(CartBadgeModule)
