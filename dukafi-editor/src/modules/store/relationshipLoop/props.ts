import { Type, type Static } from '@core/utils/typeboxHelpers'

export const RelationshipLoopPropsSchema = Type.Object({
  /**
   * What to iterate, as a PATH:
   *
   *   products                        every active product
   *   collections/featured.products   one collection's products
   *   products/canvas-bag.variants    one product's variants
   *   currentEntry.images             a list field of the entity in scope
   *   cart.items
   *
   * The relative form is what makes nesting composable. Blank falls back to
   * the legacy `relationship` + `sourceSlug` pair, so documents authored
   * before this keep resolving without migration.
   */
  source: Type.String({ default: '' }),
  relationship: Type.Union(
    [Type.Literal('products'), Type.Literal('variants'), Type.Literal('cartItems')],
    { default: 'products' },
  ),
  sourceSlug: Type.String({ default: '' }),
  /**
   * Whether the loop renders a wrapping element.
   *
   * `none` is required wherever HTML forbids a <div> between a parent and its
   * children — a <select> of looped <option>s being the case that matters.
   * The loop's own classes and pagination need an element to live on, so both
   * are dropped in that mode.
   */
  wrapper: Type.Union([Type.Literal('div'), Type.Literal('none')], { default: 'div' }),
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
