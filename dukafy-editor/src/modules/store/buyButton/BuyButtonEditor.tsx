import { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { BuyButtonProps } from './props'
import './buyButton.css'

type Variant = { sku: string; stock: number; position: number }
type ProductPreview = { variants?: Variant[] }

export function BuyButtonEditor({ props, mcClassName, nodeWrapperProps }: ModuleComponentProps<BuyButtonProps>) {
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
  const variant = props.variantSku ? variants.find(item => item.sku === props.variantSku) : variants.find(item => item.stock > 0)
  const disabled = !variant || variant.stock <= 0
  return (
    <form {...nodeWrapperProps} className={['dukafy-buy-form', mcClassName].filter(Boolean).join(' ')} onSubmit={event => event.preventDefault()}>
      <button className="dukafy-buy-button" type="submit" disabled={disabled}>{disabled ? 'Sold out' : props.label}</button>
    </form>
  )
}
