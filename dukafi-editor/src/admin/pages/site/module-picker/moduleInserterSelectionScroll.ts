export type ModuleInserterSelectionSource = 'keyboard' | 'pointer'

export function scrollSelectedItemIntoView(
  container: HTMLElement,
  selected: HTMLElement,
  source: ModuleInserterSelectionSource,
): boolean {
  if (source !== 'keyboard') return false

  const selectedRect = selected.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const edgePadding = 14

  if (selectedRect.top < containerRect.top + edgePadding) {
    scrollContainerBy(
      container,
      selectedRect.top - (containerRect.top + edgePadding),
    )
    return true
  }

  if (selectedRect.bottom > containerRect.bottom - edgePadding) {
    scrollContainerBy(
      container,
      selectedRect.bottom - (containerRect.bottom - edgePadding),
    )
    return true
  }

  return false
}

function scrollContainerBy(container: HTMLElement, top: number) {
  if (typeof container.scrollBy === 'function') {
    container.scrollBy({
      top,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    return
  }
  container.scrollTop += top
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
