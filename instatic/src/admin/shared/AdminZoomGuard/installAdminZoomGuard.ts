const NON_PASSIVE_CAPTURE_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: false,
}

/**
 * Prevent native browser zoom from scaling the admin chrome. Canvas zoom is
 * handled separately by `useCanvas`, which still receives the same events.
 */
export function installAdminZoomGuard(target: Document): () => void {
  const preventWheelZoom = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }

  const preventGestureZoom = (event: Event) => {
    event.preventDefault()
  }

  const preventTouchPinchZoom = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault()
  }

  target.addEventListener('wheel', preventWheelZoom, NON_PASSIVE_CAPTURE_OPTIONS)
  target.addEventListener('gesturestart', preventGestureZoom, NON_PASSIVE_CAPTURE_OPTIONS)
  target.addEventListener('gesturechange', preventGestureZoom, NON_PASSIVE_CAPTURE_OPTIONS)
  target.addEventListener('touchmove', preventTouchPinchZoom, NON_PASSIVE_CAPTURE_OPTIONS)

  return () => {
    target.removeEventListener('wheel', preventWheelZoom, NON_PASSIVE_CAPTURE_OPTIONS)
    target.removeEventListener('gesturestart', preventGestureZoom, NON_PASSIVE_CAPTURE_OPTIONS)
    target.removeEventListener('gesturechange', preventGestureZoom, NON_PASSIVE_CAPTURE_OPTIONS)
    target.removeEventListener('touchmove', preventTouchPinchZoom, NON_PASSIVE_CAPTURE_OPTIONS)
  }
}
