/** Shared Tooltip portal root. */
export function getTooltipRoot(): HTMLElement {
  let root = document.getElementById('tooltip-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'tooltip-root'
    document.body.appendChild(root)
  }
  return root
}
