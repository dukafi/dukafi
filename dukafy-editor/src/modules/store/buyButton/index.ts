import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { BuyButtonEditor } from './BuyButtonEditor'
import { BuyButtonPropsSchema, type BuyButtonProps } from './props'

export const BuyButtonModule: ModuleDefinition<BuyButtonProps> = {
  id: 'store.buy-button',
  name: 'Buy button',
  description: 'Adds an in-stock product variant to the session cart.',
  category: 'Commerce',
  version: '1.0.0',
  icon: PackageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    productSlug: { type: 'text', label: 'Product slug', placeholder: 'everyday-canvas-tote' },
    variantSku: { type: 'text', label: 'Variant SKU', description: 'Leave blank for the first in-stock variant.' },
    label: { type: 'text', label: 'Button label' },
    quantity: { type: 'number', label: 'Quantity', min: 1, step: 1 },
  },
  propsSchema: BuyButtonPropsSchema,
  defaults: Value.Create(BuyButtonPropsSchema),
  component: BuyButtonEditor,
  htmlTag: 'form',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(BuyButtonModule)
