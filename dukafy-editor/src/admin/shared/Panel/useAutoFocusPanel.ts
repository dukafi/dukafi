/**
 * useAutoFocusPanel — move keyboard focus into a panel when it opens.
 *
 * The hook intentionally checks `panel.contains(document.activeElement)`
 * before calling `.focus()`. This prevents a race that bites on page
 * reload: a panel persisted as `open` mounts with `isOpen === true` on
 * the very first render, schedules its focus call inside
 * `requestAnimationFrame`, and the user — who can already see the
 * rendered UI — clicks the SearchBar in the same frame. Without the
 * guard, the deferred `.focus()` lands second and steals focus back to
 * the panel `<aside>`, leaving the user's input click visibly defocused.
 * After that one-time mount race, every subsequent click works fine
 * because the autofocus effect doesn't re-fire — which is exactly the
 * intermittent "first click after reload doesn't focus" symptom.
 *
 * Pass `panelRef` (forwarded into the shared `Panel` component) and the
 * panel's `isOpen` flag. The hook is a no-op when `isOpen` is false and
 * cancels its scheduled rAF on unmount or when `isOpen` flips back.
 */
import { useEffect, type RefObject } from 'react'

export function useAutoFocusPanel(
  panelRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
): void {
  useEffect(() => {
    if (!isOpen) return undefined
    const handle = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      // If focus has already moved inside the panel (e.g. the user
      // clicked the search input while the panel was mounting), leave
      // it alone — autofocus exists to put the keyboard *somewhere*
      // useful, not to override an explicit user action.
      if (panel.contains(document.activeElement)) return
      panel.focus()
    })
    return () => cancelAnimationFrame(handle)
  }, [panelRef, isOpen])
}
