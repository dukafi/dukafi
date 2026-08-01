import { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { ImageGalleryProps } from './props'
import './imageGallery.css'

type ProductImage = { url: string; alt?: string }
type ProductPreview = { images?: ProductImage[] }

export function ImageGalleryEditor({ props, mcClassName, nodeWrapperProps }: ModuleComponentProps<ImageGalleryProps>) {
  const [product, setProduct] = useState<ProductPreview | null>(null)
  useEffect(() => {
    setProduct(null)
    if (!props.productSlug) return
    const controller = new AbortController()
    void fetch(`/admin/api/cms/commerce/products/${encodeURIComponent(props.productSlug)}`, {
      credentials: 'same-origin', signal: controller.signal,
    }).then(async response => response.ok ? (await response.json() as { product: ProductPreview }).product : null)
      .then(setProduct)
      .catch(() => undefined)
    return () => controller.abort()
  }, [props.productSlug])

  const catalogImages = product?.images ?? []
  const images = catalogImages.length > 0
    ? catalogImages
    : props.images.split(/\r?\n/).map(url => url.trim()).filter(Boolean).map(url => ({ url, alt: props.alt }))
  return (
    <div {...nodeWrapperProps} className={['dukafy-image-gallery', images.length === 0 && 'dukafy-image-gallery--empty', mcClassName].filter(Boolean).join(' ')} data-product={props.productSlug}>
      {images.map((image, index) => <img className="dukafy-image-gallery__item" src={image.url} alt={image.alt ?? props.alt} loading="lazy" decoding="async" key={`${image.url}-${index}`} />)}
    </div>
  )
}
