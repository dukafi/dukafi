import { Type, type Static } from '@core/utils/typeboxHelpers'

export const RelationshipLoopPropsSchema = Type.Object({
  relationship: Type.Union([Type.Literal('products'), Type.Literal('variants')], {
    default: 'products',
  }),
  sourceSlug: Type.String({ default: '' }),
  perPage: Type.Number({ default: 12 }),
  orderBy: Type.Union(
    [
      Type.Literal('manual'),
      Type.Literal('price'),
      Type.Literal('title'),
      Type.Literal('newest'),
    ],
    { default: 'manual' },
  ),
  direction: Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'asc' }),
  offset: Type.Number({ default: 0 }),
})

export type RelationshipLoopProps = Static<typeof RelationshipLoopPropsSchema>
