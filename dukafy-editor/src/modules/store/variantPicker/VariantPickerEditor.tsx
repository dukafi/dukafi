import { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { VariantPickerProps } from './props'
import './variantPicker.css'

type Variant = { sku: string; title: string; priceCents: number; currency: string; stock: number; position: number }
type ProductPreview = { variants?: Variant[] }

function formatPrice(cents: number, currency: string): string {
  const code = currency.toUpperCase()
  const amount = (cents / 100).toFixed(2)
  return code === 'USD' ? `$${amount}` : `${code} ${amount}`
}

export function VariantPickerEditor({ props, mcClassName, nodeWrapperProps }: ModuleComponentProps<VariantPickerProps>) {
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

  const variants = [...(product?.variants ?? [])].sort((a, b) => a.position - b.position)
  const selectedSku = props.selectedSku || variants.find(variant => variant.stock > 0)?.sku || ''
  return (
    <label {...nodeWrapperProps} className={['dukafy-variant-picker', mcClassName].filter(Boolean).join(' ')} data-product={props.productSlug}>
      <span className="dukafy-variant-picker__label">{props.label}</span>
      <select className="dukafy-variant-picker__select" name={props.name} value={selectedSku} disabled={variants.length === 0} onChange={() => undefined}>
        {variants.length === 0
          ? <option value="">No variants available</option>
          : variants.map(variant => <option value={variant.sku} disabled={variant.stock <= 0} key={variant.sku}>{variant.title}{variant.stock > 0 ? ` — ${formatPrice(variant.priceCents, variant.currency)}` : ' — Sold out'}</option>)}
      </select>
    </label>
  )
}
