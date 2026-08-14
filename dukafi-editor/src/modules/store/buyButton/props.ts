import { Type, type Static } from '@core/utils/typeboxHelpers'

export const BuyButtonPropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  variantSku: Type.String({ default: '' }),
  label: Type.String({ default: 'Add to cart' }),
  quantity: Type.Number({ default: 1 }),
})

export type BuyButtonProps = Static<typeof BuyButtonPropsSchema>
