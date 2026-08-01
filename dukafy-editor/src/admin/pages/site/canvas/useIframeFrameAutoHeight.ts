import { useEffect, type RefObject } from 'react'
import { resolveCanvasFrameHeight } from './iframeFrameHeight'
import {
  getIframeObserverConstructors,
  getIframeObserverDocument,
  observeIframeMutations,
} from './iframeFrameObservers'

interface UseIframeFrameAutoHeightOptions {
  iframeRef: RefObject<HTMLIFrameElement | null>
  iframeDoc: Document | null
  isLive: boolean
}

/**
 * Keeps design-canvas iframes expanded to their content height.
 *
 * Canvas frames should not have their own scrollbars: inner iframe scroll
 * consumes the wheel events that the parent canvas needs for pan/zoom. The
 * self-resize cap prevents viewport-unit feedback loops where growing the
 * iframe changes the child document's `vh` reference and causes endless growth.
 */
export function useIframeFrameAutoHeight({
  iframeRef,
  iframeDoc,
  isLive,
}: UseIframeFrameAutoHeightOptions): void {
  useEffect(() => {
    if (isLive || !iframeDoc) return
    const iframe = iframeRef.current
    if (!iframe) return
    const observerDocument = getIframeObserverDocument(iframe, iframeDoc)
    const observerBody = observerDocument.body
    const observerRoot = observerDocument.documentElement
    if (!observerBody || !observerRoot) return

    const MAX_SELF_RESIZES = 60
    let selfResizes = 0
    let rafId: number | null = null
    const {
      ResizeObserver: FrameResizeObserver,
      MutationObserver: FrameMutationObserver,
    } = getIframeObserverConstructors(iframe)

    const measure = () => {
      rafId = null
      const body = observerDocument.body
      const html = observerDocument.documentElement
      if (!body || !html) return
      const current = parseFloat(iframe.style.height || '0')
      const target = resolveCanvasFrameHeight({
        bodyScrollHeight: body.scrollHeight,
        documentScrollHeight: html.scrollHeight,
        currentFrameHeight: current,
      })
      if (Math.abs(current - target) <= 0.5) {
        selfResizes = 0
        return
      }
      if (selfResizes >= MAX_SELF_RESIZES) return
      iframe.style.height = `${target}px`
      selfResizes += 1
    }
    const scheduleMeasure = () => {
      if (rafId === null) rafId = requestAnimationFrame(measure)
    }

    measure()

    const ro = new FrameResizeObserver(scheduleMeasure)
    ro.observe(observerBody)
    ro.observe(observerRoot)
    const mo = observeIframeMutations(FrameMutationObserver, observerDocument, () => {
      selfResizes = 0
      scheduleMeasure()
    })
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro.disconnect()
      mo?.disconnect()
    }
  }, [iframeDoc, iframeRef, isLive])
}
