import { Type, type Static } from '@core/utils/typeboxHelpers'

export const SvgPropsSchema = Type.Object({
  svg: Type.String({ default: '' }),
  title: Type.String({ default: '' }),
})

export type SvgStoredProps = Static<typeof SvgPropsSchema>
