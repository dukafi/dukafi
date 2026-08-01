import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { StockBadgeEditor } from './StockBadgeEditor'
import { StockBadgePropsSchema, type StockBadgeProps } from './props'

export const StockBadgeModule: ModuleDefinition<StockBadgeProps> = {
  id: 'store.stock-badge',
  name: 'Stock badge',
  description: 'Live inventory availability loaded from a storefront fragment.',
  category: 'Commerce',
  version: '1.0.0',
  icon: PackageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    productSlug: { type: 'text', label: 'Product slug', placeholder: 'everyday-canvas-tote' },
    variantSku: { type: 'text', label: 'Variant SKU', description: 'Leave blank to show total product inventory.' },
    lowStockThreshold: { type: 'number', label: 'Low-stock threshold', min: 0, step: 1 },
  },
  propsSchema: StockBadgePropsSchema,
  defaults: Value.Create(StockBadgePropsSchema),
  component: StockBadgeEditor,
  htmlTag: 'span',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(StockBadgeModule)
