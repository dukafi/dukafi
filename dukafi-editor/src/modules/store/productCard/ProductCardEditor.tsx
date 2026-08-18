import React, { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { ProductCardProps } from './props'
import './productCard.css'

type ProductPreview = Pick<ProductCardProps, 'title' | 'imageUrl' | 'priceCents' | 'currency' | 'href'>

function price(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'KES' }).format(cents / 100)
}

export const ProductCardEditor: React.FC<ModuleComponentProps<ProductCardProps>> = ({ props, mcClassName, nodeWrapperProps }) => {
  const [catalogProduct, setCatalogProduct] = useState<ProductPreview | null>(null)
  useEffect(() => {
    setCatalogProduct(null)
    if (!props.productSlug) return
    const controller = new AbortController()
    void fetch(`/admin/api/cms/commerce/products/${encodeURIComponent(props.productSlug)}`, {
      credentials: 'same-origin', signal: controller.signal,
    }).then(async (response) => response.ok ? (await response.json() as { product: ProductPreview }).product : null)
      .then(setCatalogProduct)
      .catch(() => undefined)
    return () => controller.abort()
  }, [props.productSlug])

  const product = catalogProduct ?? props
  const href = product.href || (props.productSlug ? `/products/${props.productSlug}` : '#')
  return (
    <a {...nodeWrapperProps} className={['dukafy-product-card', mcClassName].filter(Boolean).join(' ')} href={href} onClick={(event) => event.preventDefault()}>
      {product.imageUrl
        ? <img className="dukafy-product-card__image" src={product.imageUrl} alt="" loading="lazy" decoding="async" />
        : <span className="dukafy-product-card__image" aria-hidden="true" />}
      <span className="dukafy-product-card__body">
        <strong className="dukafy-product-card__title">{product.title}</strong>
        <span className="dukafy-product-card__price">{price(product.priceCents, product.currency)}</span>
      </span>
    </a>
  )
}
