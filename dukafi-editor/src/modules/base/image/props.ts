import { Type, type Static } from '@core/utils/typeboxHelpers'
import { HtmlAttributesPropSchemaOptions } from '@modules/base/shared/htmlAttributes'

export const ImagePropsSchema = Type.Object({
  src: Type.String({ default: '' }),
  loading: Type.Union([Type.Literal('lazy'), Type.Literal('eager')], { default: 'lazy' }),
  fetchPriority: Type.Union(
    [Type.Literal('auto'), Type.Literal('high'), Type.Literal('low')],
    { default: 'auto' },
  ),
  decoding: Type.Union(
    [Type.Literal('async'), Type.Literal('sync'), Type.Literal('auto')],
    { default: 'async' },
  ),
  htmlAttributes: Type.Record(Type.String(), Type.String(), HtmlAttributesPropSchemaOptions),
})

export type ImageStoredProps = Static<typeof ImagePropsSchema>
