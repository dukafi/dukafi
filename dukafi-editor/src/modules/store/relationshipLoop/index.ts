import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { RelationshipLoopEditor } from './RelationshipLoopEditor'
import { RelationshipLoopPropsSchema, type RelationshipLoopProps } from './props'

export const RelationshipLoopModule: ModuleDefinition<RelationshipLoopProps> = {
  id: 'store.relationship-loop',
  name: 'Relationship loop',
  description: 'Repeats a row template for a relationship — a collection’s products, a product’s variants, or the visitor’s cart items.',
  category: 'Commerce',
  version: '1.0.0',
  icon: BoxStackSolidIcon,
  trusted: true,
  canHaveChildren: true,
  schema: {
    source: {
      type: 'text',
      label: 'Source',
      placeholder: 'products · currentEntry.images · collections/<slug>.products',
    },
    relationship: {
      type: 'select',
      label: 'Relationship',
      options: [
        { label: 'Collection products', value: 'products' },
        { label: 'Product variants', value: 'variants' },
        { label: 'Cart items', value: 'cartItems' },
      ],
    },
    sourceSlug: {
      type: 'text',
      label: 'Slug (optional)',
      placeholder: 'Blank = every product, any collection',
    },
    wrapper: { type: 'select', label: 'Wrapper', options: [
      { label: 'Div (styleable)', value: 'div' },
      { label: 'None (for <select>, <ul>…)', value: 'none' },
    ] },
    perPage: { type: 'number', label: 'Items per page', min: 1, max: 100, step: 1 },
    orderBy: {
      type: 'select',
      label: 'Order by',
      options: [
        { label: 'Manual (drag order)', value: 'manual' },
        { label: 'Price', value: 'price' },
        { label: 'Title', value: 'title' },
        { label: 'Newest', value: 'newest' },
      ],
    },
    direction: {
      type: 'select',
      label: 'Direction',
      options: [
        { label: 'Ascending', value: 'asc' },
        { label: 'Descending', value: 'desc' },
      ],
    },
    offset: { type: 'number', label: 'Skip first N', min: 0, step: 1 },
  },
  propsSchema: RelationshipLoopPropsSchema,
  defaults: Value.Create(RelationshipLoopPropsSchema),
  component: RelationshipLoopEditor,
  htmlTag: 'div',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(RelationshipLoopModule)
