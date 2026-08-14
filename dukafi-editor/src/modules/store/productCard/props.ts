import { Type, type Static } from '@core/utils/typeboxHelpers'

export const ProductCardPropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  imageUrl: Type.String({ default: '' }),
  title: Type.String({ default: 'Product title' }),
  priceCents: Type.Number({ default: 0 }),
  currency: Type.String({ default: 'USD' }),
  href: Type.String({ default: '' }),
})

export type ProductCardProps = Static<typeof ProductCardPropsSchema>
