import { Type, type Static } from '@core/utils/typeboxHelpers'

export const CartBadgePropsSchema = Type.Object({
  label: Type.String({ default: 'Cart' }),
  href: Type.String({ default: '/cart' }),
})

export type CartBadgeProps = Static<typeof CartBadgePropsSchema>
