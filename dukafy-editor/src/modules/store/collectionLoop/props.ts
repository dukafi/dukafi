import { Type, type Static } from '@core/utils/typeboxHelpers'

export const CollectionLoopPropsSchema = Type.Object({
  collectionSlug: Type.String({ default: '' }),
  perPage: Type.Number({ default: 12 }),
})

export type CollectionLoopProps = Static<typeof CollectionLoopPropsSchema>
