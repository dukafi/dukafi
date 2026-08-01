import { Type, type Static } from '@core/utils/typeboxHelpers'
import { HtmlAttributesPropSchemaOptions } from '@modules/base/shared/htmlAttributes'

export const TextPropsSchema = Type.Object({
  text: Type.String({ default: 'Add your text here.' }),
  tag: Type.Union(
    [
      Type.Literal('p'),
      Type.Literal('none'),
      Type.Literal('h1'),
      Type.Literal('h2'),
      Type.Literal('h3'),
      Type.Literal('h4'),
      Type.Literal('h5'),
      Type.Literal('h6'),
      Type.Literal('span'),
      Type.Literal('div'),
      Type.Literal('small'),
      Type.Literal('strong'),
      Type.Literal('em'),
    ],
    { default: 'p' },
  ),
  htmlAttributes: Type.Record(Type.String(), Type.String(), HtmlAttributesPropSchemaOptions),
})

export type TextStoredProps = Static<typeof TextPropsSchema>
