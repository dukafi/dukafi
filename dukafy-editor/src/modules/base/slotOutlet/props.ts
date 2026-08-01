import { Type, type Static } from '@core/utils/typeboxHelpers'

export const SlotOutletPropsSchema = Type.Object({
  slotName: Type.String({ default: 'children' }),
})

export type SlotOutletStoredProps = Static<typeof SlotOutletPropsSchema>
