import { useEffect, useRef, type RefObject } from 'react'

interface IframeCursorBridgeHandlers {
  onCursorMove?: (event: MouseEvent) => void
  onCursorLeave?: () => void
}

/**
 * Surfaces iframe-native cursor movement to parent editor chrome. Empty body
 * regions inside the iframe do not produce React events, so cursor-following
 * overlays need native listeners at the iframe boundary.
 */
export function useIframeCursorBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  iframeDoc: Document | null,
  handlers: IframeCursorBridgeHandlers,
): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    if (!iframeDoc) return
    const iframe = iframeRef.current
    if (!iframe) return

    const handleMove = (event: MouseEvent) => {
      handlersRef.current.onCursorMove?.(event)
    }
    const handleLeave = () => {
      handlersRef.current.onCursorLeave?.()
    }

    iframeDoc.addEventListener('mousemove', handleMove)
    iframe.addEventListener('mouseleave', handleLeave)
    return () => {
      iframeDoc.removeEventListener('mousemove', handleMove)
      iframe.removeEventListener('mouseleave', handleLeave)
    }
  }, [iframeDoc, iframeRef])
}
