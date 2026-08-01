import { Type, type Static } from '@core/utils/typeboxHelpers'

export const PricePropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  variantSku: Type.String({ default: '' }),
  priceCents: Type.Number({ default: 0 }),
  currency: Type.String({ default: 'USD' }),
})

export type PriceProps = Static<typeof PricePropsSchema>
