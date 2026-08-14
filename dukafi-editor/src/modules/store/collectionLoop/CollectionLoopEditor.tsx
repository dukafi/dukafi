import React, { useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import type { CollectionLoopProps } from './props'
import './collectionLoop.css'

type CollectionPreview = { slug: string; productIds?: number[] }

export function CollectionLoopEditor({ props, children, mcClassName, nodeWrapperProps }: ModuleComponentProps<CollectionLoopProps>) {
  const [productCount, setProductCount] = useState<number | null>(null)
  useEffect(() => {
    setProductCount(null)
    if (!props.collectionSlug) return
    const controller = new AbortController()
    void fetch('/admin/api/cms/commerce/collections', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => response.ok ? (await response.json() as { collections: CollectionPreview[] }).collections : [])
      .then(collections => setProductCount(collections.find(item => item.slug === props.collectionSlug)?.productIds?.length ?? 0))
      .catch(() => undefined)
    return () => controller.abort()
  }, [props.collectionSlug])

  if (React.Children.count(children) === 0) {
    return <CanvasModulePlaceholder {...nodeWrapperProps} className={mcClassName} icon={<BoxStackSolidIcon size={16} color="currentColor" />} label="Drop product templates into this collection loop" />
  }

  return (
    <div {...nodeWrapperProps} className={['dukafy-collection-loop', mcClassName].filter(Boolean).join(' ')} data-collection={props.collectionSlug} data-page="1">
      {children}
      <span className="dukafy-collection-loop__editor-note">{productCount === null ? 'Collection preview' : `${productCount} products · ${Math.min(productCount, props.perPage)} shown per page`}</span>
    </div>
  )
}
