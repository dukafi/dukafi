import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { CollectionLoopEditor } from './CollectionLoopEditor'
import { CollectionLoopPropsSchema, type CollectionLoopProps } from './props'

export const CollectionLoopModule: ModuleDefinition<CollectionLoopProps> = {
  id: 'store.collection-loop',
  name: 'Collection loop',
  description: 'Repeats child product templates for a catalog collection.',
  category: 'Commerce',
  version: '1.0.0',
  icon: BoxStackSolidIcon,
  trusted: true,
  canHaveChildren: true,
  schema: {
    collectionSlug: { type: 'text', label: 'Collection slug', placeholder: 'featured' },
    perPage: { type: 'number', label: 'Products per page', min: 1, max: 100, step: 1 },
  },
  propsSchema: CollectionLoopPropsSchema,
  defaults: Value.Create(CollectionLoopPropsSchema),
  component: CollectionLoopEditor,
  htmlTag: 'div',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(CollectionLoopModule)
