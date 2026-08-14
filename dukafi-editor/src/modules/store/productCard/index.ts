import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { ProductCardEditor } from './ProductCardEditor'
import { ProductCardPropsSchema, type ProductCardProps } from './props'

export const ProductCardModule: ModuleDefinition<ProductCardProps> = {
  id: 'store.product-card',
  name: 'Product card',
  description: 'Catalog product image, title, and starting price.',
  category: 'Commerce',
  version: '1.0.0',
  icon: PackageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    productSlug: { type: 'text', label: 'Product slug', placeholder: 'everyday-canvas-tote' },
    imageUrl: { type: 'image', label: 'Fallback image' },
    title: { type: 'text', label: 'Fallback title' },
    priceCents: { type: 'number', label: 'Fallback price', min: 0, step: 1, unit: 'cents' },
    currency: { type: 'text', label: 'Currency' },
    href: { type: 'url', label: 'Fallback link' },
  },
  propsSchema: ProductCardPropsSchema,
  defaults: Value.Create(ProductCardPropsSchema),
  component: ProductCardEditor,
  htmlTag: 'a',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(ProductCardModule)
