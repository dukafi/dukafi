import { generateFrameworkColorVariableSets } from '@core/framework'
import type { FrameworkColorToken, FrameworkColorUtilityType } from '@core/framework-schema'
import type { UpdateFrameworkColorTokenPatch } from '@site/store/slices/site/types'

export const MAX_VARIANT_COUNT = 12

export const DEFAULT_NEW_TOKEN_COLOR = 'hsla(238, 100%, 62%, 1)'

export const EMPTY_COLORS = { tokens: [] }

export const UTILITY_OPTIONS: Array<{
  key: FrameworkColorUtilityType
  label: string
}> = [
  { key: 'text', label: 'Text utility' },
  { key: 'background', label: 'Background utility' },
  { key: 'border', label: 'Border utility' },
  { key: 'fill', label: 'Fill utility' },
]

export type ColorPreviewVariable = ReturnType<
  typeof generateFrameworkColorVariableSets
>['light'][number]

/**
 * Derive the unique set of non-empty category labels from the tokens array,
 * sorted alphabetically (case-insensitive). When no token references a label,
 * it ceases to exist — categories are purely emergent from the token data.
 */
export function deriveCategoryLabels(tokens: FrameworkColorToken[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    const label = token.category.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(label)
  }
  return result.sort((a, b) => a.localeCompare(b))
}

/**
 * Return whether a token can be moved within its category group in the
 * given direction. Uses the same sort order (by `order` then `slug`) that
 * the published list uses so the button state is always accurate.
 */
export function canMoveToken(
  tokens: FrameworkColorToken[],
  token: FrameworkColorToken,
  direction: 'up' | 'down',
): boolean {
  const group = tokens
    .filter((candidate) => candidate.category === token.category)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
  const index = group.findIndex((candidate) => candidate.id === token.id)
  return direction === 'up'
    ? index > 0
    : index >= 0 && index < group.length - 1
}

/**
 * Clamp and floor a variant count input to the valid [0, MAX_VARIANT_COUNT]
 * integer range. Non-finite values fall back to 0.
 */
export function clampVariantCountInput(value: string | number): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return 0
  return Math.max(0, Math.min(MAX_VARIANT_COUNT, Math.floor(numericValue)))
}

/**
 * Pick a short, human-readable action label for the confirmation dialog,
 * given a color-token patch. Falls back to a generic label when the patch
 * doesn't match a known destructive shape.
 */
export function deriveColorPatchActionLabel(
  patch: UpdateFrameworkColorTokenPatch,
  token: FrameworkColorToken,
): string {
  if (patch.generateTints?.enabled === false)
    return `Disable "${token.slug}" tints`
  if (patch.generateShades?.enabled === false)
    return `Disable "${token.slug}" shades`
  if (patch.generateTransparent === false)
    return `Disable "${token.slug}" transparent steps`
  if (patch.generateTints?.count !== undefined)
    return `Update "${token.slug}" tint count`
  if (patch.generateShades?.count !== undefined)
    return `Update "${token.slug}" shade count`
  if (patch.generateUtilities) {
    const disabled = UTILITY_OPTIONS.filter(
      ({ key }) => patch.generateUtilities![key] === false,
    ).map(({ key }) => key)
    if (disabled.length === 1)
      return `Disable "${token.slug}" ${disabled[0]} utility`
    if (disabled.length > 1) return `Disable "${token.slug}" utilities`
  }
  if (patch.slug !== undefined) return `Rename token to "${patch.slug}"`
  return `Update token "${token.slug}"`
}
