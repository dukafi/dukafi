import { Type, type Static } from '@core/utils/typeboxHelpers'

export const StockBadgePropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  variantSku: Type.String({ default: '' }),
  lowStockThreshold: Type.Number({ default: 5 }),
})

export type StockBadgeProps = Static<typeof StockBadgePropsSchema>
