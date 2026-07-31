function callEventListener(
  targetDocument: Document,
  listener: EventListenerOrEventListenerObject,
  event: Event,
): void {
  if (typeof listener === 'function') {
    listener.call(targetDocument, event)
    return
  }
  listener.handleEvent(event)
}

export function withCanvasDomReadyReplay<T>(
  targetDocument: Document,
  run: () => T,
): T {
  const originalAddEventListener = targetDocument.addEventListener
  const replayDomReady = targetDocument.readyState !== 'loading'

  if (replayDomReady) {
    targetDocument.addEventListener = function addEventListenerWithDomReadyReplay(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (!listener) return
      if (type === 'DOMContentLoaded') {
        const win = targetDocument.defaultView ?? window
        win.setTimeout(() => {
          callEventListener(
            targetDocument,
            listener,
            new win.Event('DOMContentLoaded', { bubbles: false, cancelable: false }),
          )
        }, 0)
        return
      }
      originalAddEventListener.call(targetDocument, type, listener, options)
    }
  }

  try {
    return run()
  } finally {
    if (replayDomReady) targetDocument.addEventListener = originalAddEventListener
  }
}
