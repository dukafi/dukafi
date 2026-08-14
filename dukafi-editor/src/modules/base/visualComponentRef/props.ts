import { Type, type Static } from '@core/utils/typeboxHelpers'

export const VisualComponentRefPropsSchema = Type.Object({
  componentId: Type.String({ default: '' }),
  propOverrides: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
})

export type VisualComponentRefStoredProps = Static<typeof VisualComponentRefPropsSchema>
