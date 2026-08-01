interface IframeObserverConstructors {
  ResizeObserver: typeof ResizeObserver
  MutationObserver: typeof MutationObserver
}

export function getIframeObserverConstructors(
  iframe: HTMLIFrameElement,
): IframeObserverConstructors {
  const frameWindow = iframe.contentWindow as (Window & typeof globalThis) | null
  return {
    ResizeObserver: frameWindow?.ResizeObserver ?? ResizeObserver,
    MutationObserver: frameWindow?.MutationObserver ?? MutationObserver,
  }
}

export function getIframeObserverDocument(
  iframe: HTMLIFrameElement,
  fallbackDocument: Document,
): Document {
  return iframe.contentWindow?.document ?? fallbackDocument
}

export function observeIframeMutations(
  MutationObserverConstructor: typeof MutationObserver,
  iframeDoc: Document,
  callback: MutationCallback,
): MutationObserver | null {
  const body = iframeDoc.body
  const head = iframeDoc.head
  if (!body || !head) return null
  const NodeConstructor = iframeDoc.defaultView?.Node ?? Node
  if (!(body instanceof NodeConstructor) || !(head instanceof NodeConstructor)) {
    return null
  }

  const observer = new MutationObserverConstructor(callback)
  try {
    observer.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    observer.observe(head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return observer
  } catch (_err) {
    // Some browser runtimes reject observing srcDoc iframe nodes from the
    // parent React context. ResizeObserver still performs the height fit; this
    // observer only resets the viewport-feedback budget after DOM/style edits.
    observer.disconnect()
    return null
  }
}
