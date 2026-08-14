import { Type, type Static } from '@core/utils/typeboxHelpers'
import { HtmlAttributesPropSchemaOptions } from '@modules/base/shared/htmlAttributes'

export const ContainerPropsSchema = Type.Object({
  tag: Type.String({ default: 'div' }),
  customTag: Type.String({ default: '' }),
  htmlAttributes: Type.Record(Type.String(), Type.String(), HtmlAttributesPropSchemaOptions),
})

export type ContainerStoredProps = Static<typeof ContainerPropsSchema>
