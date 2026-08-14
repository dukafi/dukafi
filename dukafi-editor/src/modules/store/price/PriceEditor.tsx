import { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import type { PriceProps } from './props'

type Variant = { sku:string;priceCents:number;currency:string;position:number }
type ProductPreview = { priceCents?:number;currency?:string;variants?:Variant[] }

function formatPrice(cents:number,currency:string):string{
  const amount=(cents/100).toFixed(2)
  return currency.toUpperCase()==='USD'?`$${amount}`:`${currency.toUpperCase()} ${amount}`
}

export function PriceEditor({props,mcClassName,nodeWrapperProps}:ModuleComponentProps<PriceProps>){
  const [product,setProduct]=useState<ProductPreview|null>(null)
  useEffect(()=>{setProduct(null);if(!props.productSlug)return;const controller=new AbortController();void fetch(`/admin/api/cms/commerce/products/${encodeURIComponent(props.productSlug)}`,{credentials:'same-origin',signal:controller.signal}).then(async response=>response.ok?(await response.json() as {product:ProductPreview}).product:null).then(setProduct).catch(()=>undefined);return()=>controller.abort()},[props.productSlug])
  const variants=product?.variants??[]
  const variant=props.variantSku?variants.find(item=>item.sku===props.variantSku):[...variants].sort((a,b)=>a.position-b.position)[0]
  const cents=variant?.priceCents??product?.priceCents??props.priceCents
  const currency=variant?.currency??product?.currency??props.currency
  return <span {...nodeWrapperProps} className={['dukafy-price',mcClassName].filter(Boolean).join(' ')} data-product={props.productSlug} data-variant={props.variantSku||undefined}>{formatPrice(cents,currency)}</span>
}
