/**
 * Shared utilities used across the three framework families
 * (colors, typography, spacing).
 */

/**
 * Compute the next available `order` value for an item being appended to an
 * ordered list. Returns 0 when the list is empty, otherwise `max(order) + 1`.
 */
export function nextOrderValue(items: Array<{ order: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.order), -1) + 1
}
