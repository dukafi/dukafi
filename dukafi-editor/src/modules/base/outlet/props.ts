import { Type, type Static } from '@core/utils/typeboxHelpers'

export const OutletPropsSchema = Type.Object({
  tag: Type.String({ default: 'main' }),
  customTag: Type.String({ default: '' }),
  html: Type.String({ default: '' }),
})

export type OutletStoredProps = Static<typeof OutletPropsSchema>
