import React, { use, useEffect, useState } from 'react'
import type { ModuleComponentProps } from '@core/module-engine'
import { CanvasModulePlaceholder } from '@ui/components/CanvasModulePlaceholder'
import { CanvasTemplateContext } from '@site/canvas/CanvasContexts'
import type { TemplateRenderDataContext } from '@core/templates/dynamicBindings'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import type { RelationshipLoopProps } from './props'
import { useRelationshipPreviewEntry } from './useRelationshipPreviewEntry'
import { loopSourceFor, parseLoopSource } from '@core/commerce/loopSource'
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


  const baseContext = use(CanvasTemplateContext)
  // The entry the enclosing loop is previewing — what a relative source
  // (`currentEntry.images`) reads its list field from.
  const enclosingEntry = baseContext?.entryStack?.at(-1) ?? null
  const source = loopSourceFor(props as unknown as Record<string, unknown>)
  const entry = useRelationshipPreviewEntry(source, enclosingEntry ?? null)

  const parsedSource = parseLoopSource(source)
  const noun = parsedSource?.kind === 'cart'
    ? 'cart items'
    : parsedSource?.fields.at(-1)
      ?? (parsedSource?.kind === 'products' ? 'products'
        : parsedSource?.kind === 'reviews' ? 'reviews' : 'items')

  // EVERY hook must run before this early return. An empty loop used to bail
  // out above the preview hooks, so dropping the first row into it changed the
  // hook count between renders — React's "Rendered more hooks than during the
  // previous render". Hooks first, branching after.
  if (React.Children.count(children) === 0) {
    return (
      <CanvasModulePlaceholder
        {...nodeWrapperProps}
        className={mcClassName}
        icon={<BoxStackSolidIcon size={16} color="currentColor" />}
        label={`Drop a row template into this ${noun} loop`}
      />
    )
  }

  // ONE real entry, pushed onto the entry stack so every `currentEntry.*`
  // binding inside the row resolves against actual catalogue data. The
  // published page repeats the row per item; the canvas shows a single
  // instance because that is the thing you edit.
  const rowContext: TemplateRenderDataContext | undefined = entry
    ? { ...baseContext, entryStack: [...(baseContext?.entryStack ?? []), entry] }
    : baseContext

  const note = entry === null && (props.sourceSlug || parseLoopSource(source)?.kind === 'currentEntry')
    ? `No ${noun} to preview — check the slug`
    : itemCount === null
      ? `${noun} preview`
      : `${itemCount} ${noun} · ${Math.min(itemCount, props.perPage)} shown per page`

  return (
    <div {...nodeWrapperProps} className={['dukafy-collection-loop', mcClassName].filter(Boolean).join(' ')} data-relationship={props.relationship} data-source={props.sourceSlug} data-page="1">
      <CanvasTemplateContext.Provider value={rowContext}>
        {children}
      </CanvasTemplateContext.Provider>
      <span className="dukafy-collection-loop__editor-note">{note}</span>
    </div>
  )
}
