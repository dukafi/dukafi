import { Type, type Static } from '@core/utils/typeboxHelpers'

export const ImageGalleryPropsSchema = Type.Object({
  productSlug: Type.String({ default: '' }),
  images: Type.String({ default: '' }),
  alt: Type.String({ default: '' }),
})

export type ImageGalleryProps = Static<typeof ImageGalleryPropsSchema>
