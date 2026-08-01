import React, { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import type { RelationshipLoopProps } from './props'
import './relationshipLoop.css'

type CollectionPreview = { slug: string; productIds?: number[] }
type ProductPreview = { slug: string; variants?: unknown[] }

export function RelationshipLoopEditor({ props, children, mcClassName, nodeWrapperProps }: ModuleComponentProps<RelationshipLoopProps>) {
  const [itemCount, setItemCount] = useState<number | null>(null)
  useEffect(() => {
    setItemCount(null)
    if (!props.sourceSlug) return
    const controller = new AbortController()
    const path = props.relationship === 'variants' ? '/admin/api/cms/commerce/products' : '/admin/api/cms/commerce/collections'
    void fetch(path, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return []
        if (props.relationship === 'variants') {
          const body = await response.json() as { products: ProductPreview[] }
          return body.products
        }
        const body = await response.json() as { collections: CollectionPreview[] }
        return body.collections
      })
      .then((rows) => {
        const match = rows.find((row) => row.slug === props.sourceSlug)
        const count = props.relationship === 'variants'
          ? (match as ProductPreview | undefined)?.variants?.length ?? 0
          : (match as CollectionPreview | undefined)?.productIds?.length ?? 0
        setItemCount(count)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [props.relationship, props.sourceSlug])

  if (React.Children.count(children) === 0) {
    return (
      <CanvasModulePlaceholder
        {...nodeWrapperProps}
        className={mcClassName}
        icon={<BoxStackSolidIcon size={16} color="currentColor" />}
        label={`Drop a row template into this ${props.relationship} loop`}
      />
    )
  }

  const noun = props.relationship === 'variants' ? 'variants' : 'products'
  return (
    <div {...nodeWrapperProps} className={['dukafy-collection-loop', mcClassName].filter(Boolean).join(' ')} data-relationship={props.relationship} data-source={props.sourceSlug} data-page="1">
      {children}
      <span className="dukafy-collection-loop__editor-note">
        {itemCount === null ? `${noun} preview` : `${itemCount} ${noun} · ${Math.min(itemCount, props.perPage)} shown per page`}
      </span>
    </div>
  )
}
