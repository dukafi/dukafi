import { Type, type Static } from '@core/utils/typeboxHelpers'

export const VariantPickerPropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  label: Type.String({ default: 'Choose an option' }),
  name: Type.String({ default: 'variant' }),
  selectedSku: Type.String({ default: '' }),
})

export type VariantPickerProps = Static<typeof VariantPickerPropsSchema>
