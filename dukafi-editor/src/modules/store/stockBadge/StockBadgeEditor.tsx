import { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { StockBadgeProps } from './props'
import './stockBadge.css'

type Variant = { sku: string; stock: number }
type ProductPreview = { variants?: Variant[] }

export function StockBadgeEditor({ props, mcClassName, nodeWrapperProps }: ModuleComponentProps<StockBadgeProps>) {
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

  const variants = product?.variants ?? []
  const selected = props.variantSku ? variants.find(variant => variant.sku === props.variantSku) : null
  const quantity = selected ? selected.stock : variants.reduce((sum, variant) => sum + variant.stock, 0)
  const state = quantity <= 0 ? 'sold-out' : quantity <= props.lowStockThreshold ? 'low' : 'in-stock'
  const label = quantity <= 0 ? 'Sold out' : quantity <= props.lowStockThreshold ? `Only ${quantity} left` : 'In stock'
  return <span {...nodeWrapperProps} className={['dukafy-stock-badge', `dukafy-stock-badge--${state}`, mcClassName].filter(Boolean).join(' ')} data-stock={quantity} aria-live="polite">{label}</span>
}
