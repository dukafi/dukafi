import { Type, type Static } from '@core/utils/typeboxHelpers'
import { AnchorTargetSchema } from '@modules/base/shared/anchorTarget'
import { HtmlAttributesPropSchemaOptions } from '@modules/base/shared/htmlAttributes'

export const LinkPropsSchema = Type.Object({
  href: Type.String({ default: '#' }),
  text: Type.String({ default: 'Click here' }),
  target: AnchorTargetSchema,
  htmlAttributes: Type.Record(Type.String(), Type.String(), HtmlAttributesPropSchemaOptions),
})

export type LinkStoredProps = Static<typeof LinkPropsSchema>
