import { Type, type Static } from '@core/utils/typeboxHelpers'

export const ListPropsSchema = Type.Object({
  items: Type.String({ default: '' }),
  listType: Type.Union([Type.Literal('unordered'), Type.Literal('ordered')], {
    default: 'unordered',
  }),
})

export type ListStoredProps = Static<typeof ListPropsSchema>
