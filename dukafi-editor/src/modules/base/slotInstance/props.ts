import { Type, type Static } from '@core/utils/typeboxHelpers'

export const SlotInstancePropsSchema = Type.Object({
  slotName: Type.String({ default: 'children' }),
})

export type SlotInstanceStoredProps = Static<typeof SlotInstancePropsSchema>
