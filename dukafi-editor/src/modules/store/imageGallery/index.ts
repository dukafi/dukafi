import type { ModuleDefinition } from '@core/module-engine'
import { registry } from '@core/module-engine'
import { Value } from '@core/utils/typeboxHelpers'
import { ImageSolidIcon } from 'pixel-art-icons/icons/image-solid'
import { ImageGalleryEditor } from './ImageGalleryEditor'
import { ImageGalleryPropsSchema, type ImageGalleryProps } from './props'

export const ImageGalleryModule: ModuleDefinition<ImageGalleryProps> = {
  id: 'store.image-gallery',
  name: 'Product image gallery',
  description: 'A responsive gallery bound to a catalog product.',
  category: 'Commerce',
  version: '1.0.0',
  icon: ImageSolidIcon,
  trusted: true,
  canHaveChildren: false,
  schema: {
    productSlug: { type: 'text', label: 'Product slug', placeholder: 'everyday-canvas-tote' },
    images: { type: 'textarea', label: 'Fallback images', description: 'One image URL per line.', rows: 5 },
    alt: { type: 'text', label: 'Fallback alt text' },
  },
  propsSchema: ImageGalleryPropsSchema,
  defaults: Value.Create(ImageGalleryPropsSchema),
  component: ImageGalleryEditor,
  htmlTag: 'div',
  render: () => ({ html: '' }),
}

registry.registerOrReplace(ImageGalleryModule)
