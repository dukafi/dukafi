/**
 * CanvasComposedTree — render the active document the way it publishes: inside
 * its matching template chain.
 *
 * When the document being edited is wrapped by one or more templates (an
 * `everywhere` layout around a page or a postTypes template), those wrappers
 * render READ-ONLY around the editable document via `ReadOnlyNodeTree`, with the
 * editable document spliced into the innermost wrapper's `base.outlet` — exactly
 * where the publisher would splice it. The wrapper chrome (nav, footer, …) is
 * pixel-identical to the published page but non-interactive; only the active
 * document's own nodes stay fully editable (selection, hover, DnD), so every
 * existing editor subsystem keeps operating on the unchanged active-page tree.
 *
 * Body ownership mirrors the publisher: the published `<body>` is the OUTERMOST
 * wrapper's body element (the inner document's `base.body` is dropped and its
 * children spliced in — inner body classes are not preserved). So in the wrapped
 * case we apply the outermost wrapper body's classes, inline styles, and safe
 * HTML attributes to the iframe `<body>` and render the active document as its
 * body CHILDREN, rather than letting the inner body claim presentation the
 * published page would not carry.
 *
 * When nothing wraps the document (editing the `everywhere` layout itself, or a
 * site with no matching template), it renders exactly as before — a plain
 * `NodeRenderer` at the document root, whose `base.body` claims the iframe body
 * as usual. Its own outlet, if any, still previews matched content through
 * `OutletEditor`.
 *
 * SITE PARTIALS (the header and footer, `kind: 'partial'`) compose around the
 * document the same read-only way, mirroring `SitePartials.compose` on the
 * server: header children before the page's own, footer children after. They
 * are not templates and have no outlet — the publisher splices them by
 * position — so they are handled separately from the wrapper chain above.
 *
 * They render through `ReadOnlyNodeTree`, so the cart badge and account links
 * in the header look exactly as they will on the storefront while staying
 * non-interactive: editing the header happens by opening the header, not by
 * reaching into someone else's document from a page.
 */

import { use, useEffect, type ReactNode } from 'react'
import type { BaseNode, Page } from '@core/page-tree'
import { classNamesForClassIds } from '@core/page-tree'
import { useEditorStore } from '@site/store/store'
import { ReadOnlyNodeTree } from '@modules/base/utils/ReadOnlyNodeTree'
import { htmlAttributesForReact } from '@modules/base/shared/htmlAttributes'
import { useResponsiveBackgroundStyle } from '@admin/pages/media/hooks/useResponsiveBackgroundStyle'
import { NodeRenderer } from './NodeRenderer'
import { resolveEditorWrapperTemplates } from './canvasComposition'
import { CanvasDocumentContext, CanvasTemplateContext } from './CanvasContexts'
import { applyIframeBodyPresentation } from './iframeBodyPresentation'

const NO_WRAPPERS: Page[] = []
const NO_PARTIALS: Page[] = []

/** Slugs `SitePartials` uses on the server. Order is the composition order. */
const HEADER_SLUG = 'site-header'
const FOOTER_SLUG = 'site-footer'

/**
 * The header and footer to draw around `page`, or none.
 *
 * Never around a partial itself (a header does not wrap itself) and never
 * around a template being edited as a document — the same rule the bake
 * follows, where partials wrap the pages templates produce, not the template
 * source.
 */
function sitePartials(pages: Page[], page: Page): { header: Page | null; footer: Page | null } {
  if (page.kind === 'partial') return { header: null, footer: null }
  const find = (slug: string) => pages.find((entry) => entry.kind === 'partial' && entry.slug === slug) ?? null
  return { header: find(HEADER_SLUG), footer: find(FOOTER_SLUG) }
}

interface CanvasComposedTreeProps {
  /** The active document being edited (the editable page / template). */
  page: Page
}

export function CanvasComposedTree({ page }: CanvasComposedTreeProps) {
  const site = useEditorStore((s) => s.site)
  // Pages live on the site document, not at the store root.
  const pages = useEditorStore((s) => s.site?.pages) ?? NO_PARTIALS
  const isVcMode = useEditorStore((s) => s.activeDocument?.kind === 'visualComponent')
  const styleRules = useEditorStore((s) => s.site?.styleRules ?? null)
  const templateContext = use(CanvasTemplateContext)

  // Templates wrapping the active document (outermost-first). A Visual
  // Component edit surface is never a published route, so it is never wrapped.
  const wrappers = !isVcMode && site ? resolveEditorWrapperTemplates(site, page) : NO_WRAPPERS
  const outerBody = wrappers[0]?.nodes[wrappers[0].rootNodeId]

  const { header, footer } = isVcMode ? { header: null, footer: null } : sitePartials(pages, page)
  const chrome = (content: ReactNode) => (
    <>
      {header && <PartialChrome partial={header} classes={styleRules} templateContext={templateContext} />}
      {content}
      {footer && <PartialChrome partial={footer} classes={styleRules} templateContext={templateContext} />}
    </>
  )

  // No wrapping templates → render the document exactly as before; its own
  // base.body claims the iframe <body>.
  if (wrappers.length === 0) {
    return chrome(<NodeRenderer nodeId={page.rootNodeId} />)
  }

  // Editable content = the active document's body children, rendered editable.
  // The active document's base.body is intentionally NOT rendered here — it is
  // dropped just as the publisher drops the inner body when splicing.
  const bodyNode = page.nodes[page.rootNodeId]
  const editableContent = bodyNode
    ? bodyNode.children.map((childId) => <NodeRenderer key={childId} nodeId={childId} />)
    : null

  // Nest the read-only wrappers from innermost outward; each wrapper's outlet
  // hosts the next inner layer, the innermost hosting the editable content.
  let composed: ReactNode = <>{editableContent}</>
  for (let i = wrappers.length - 1; i >= 0; i--) {
    const wrapper = wrappers[i]
    composed = (
      <ReadOnlyNodeTree
        nodes={wrapper.nodes as Record<string, BaseNode>}
        rootNodeId={wrapper.rootNodeId}
        classes={styleRules}
        outletSlot={composed}
        readonly={{ label: `${wrapper.title} template`, kind: 'page', targetId: wrapper.id }}
        templateContext={templateContext}
      />
    )
  }

  // Mirror the outermost wrapper body's classes + inline styles onto the
  // iframe <body>, exactly as the published document would carry them.
  const bodyClassName = outerBody
    ? classNamesForClassIds(styleRules, outerBody.classIds).join(' ')
    : ''

  return (
    <>
      <IframeBodyPresentationOwner
        className={bodyClassName}
        inlineStyles={outerBody?.inlineStyles}
        htmlAttributes={outerBody?.props.htmlAttributes}
      />
      {chrome(composed)}
    </>
  )
}

/**
 * One partial, read-only. Its `base.body` is transparent in
 * `ReadOnlyNodeTree`, so this renders the partial's children directly —
 * matching the server, which drops the partial's own body when splicing.
 */
function PartialChrome({
  partial,
  classes,
  templateContext,
}: {
  partial: Page
  classes: Parameters<typeof ReadOnlyNodeTree>[0]['classes']
  templateContext: Parameters<typeof ReadOnlyNodeTree>[0]['templateContext']
}) {
  return (
    <ReadOnlyNodeTree
      nodes={partial.nodes as Record<string, BaseNode>}
      rootNodeId={partial.rootNodeId}
      classes={classes}
      readonly={{ label: partial.title, kind: 'page', targetId: partial.id }}
      templateContext={templateContext}
    />
  )
}

/**
 * Apply the outer body's presentation to the host iframe's `<body>` while
 * mounted (and restore it on unmount). The frame supplies its final srcDoc
 * through context, so this owner contributes no editor-only body child. Only
 * used in the wrapped case, where no `base.body` editor runs to own the body.
 */
function IframeBodyPresentationOwner({
  className,
  inlineStyles,
  htmlAttributes,
}: {
  className: string
  inlineStyles?: BaseNode['inlineStyles']
  htmlAttributes?: unknown
}) {
  const iframeDocument = use(CanvasDocumentContext)
  const style = useResponsiveBackgroundStyle(inlineStyles)
  useEffect(() => {
    const body = iframeDocument?.body
    if (!body) return
    return applyIframeBodyPresentation(body, {
      className,
      style,
      attributes: htmlAttributesForReact(htmlAttributes),
    })
  }, [className, htmlAttributes, iframeDocument, style])
  return null
}
