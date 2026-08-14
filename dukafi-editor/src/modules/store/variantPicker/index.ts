import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { VariantPickerEditor } from './VariantPickerEditor'
import { VariantPickerPropsSchema, type VariantPickerProps } from './props'

export const VariantPickerModule: ModuleDefinition<VariantPickerProps> = {
  id: 'store.variant-picker',
  name: 'Variant picker',
  description: 'A product option selector with price and stock state.',
  category: 'Commerce',
  version: '1.0.0',
  icon: PackageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    productSlug: { type: 'text', label: 'Product slug', placeholder: 'everyday-canvas-tote' },
    label: { type: 'text', label: 'Label' },
    name: { type: 'text', label: 'Form field name' },
    selectedSku: { type: 'text', label: 'Initially selected SKU', description: 'Leave blank for the first in-stock variant.' },
  },
  propsSchema: VariantPickerPropsSchema,
  defaults: Value.Create(VariantPickerPropsSchema),
  component: VariantPickerEditor,
  htmlTag: 'label',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(VariantPickerModule)
