/**
 * Semantic spacing presets — the four Relume-style site defaults.
 *
 * Quiet recipes actually use:
 *   max-w-3xl / max-w-6xl  (about column vs product grid)
 *   p-6                     (cards, cart sheet)
 *   py-16 / md:py-24        (section block)
 *   px-6                    (section inline)
 *
 * Those map onto four CSS variables. Tailwind on a selected element still
 * wins; these are the site-wide defaults pages can reference.
 */

import type {
  FrameworkSpacingPresets,
  FrameworkSpacingSettings,
} from '@core/framework-schema'

export const CONTAINER_WIDTH_STEPS = ['narrow', 'regular', 'wide'] as const
export const CARD_PADDING_STEPS = ['tight', 'regular', 'roomy'] as const
export const SPACE_STEPS = ['xs', 's', 'm', 'l', 'xl'] as const
export const RADIUS_STEPS = ['none', 'sm', 'md', 'lg', 'full'] as const

export type ContainerWidthStep = (typeof CONTAINER_WIDTH_STEPS)[number]
export type CardPaddingStep = (typeof CARD_PADDING_STEPS)[number]
export type SpaceStep = (typeof SPACE_STEPS)[number]
export type RadiusStep = (typeof RADIUS_STEPS)[number]

/** max-w-3xl / max-w-5xl / max-w-6xl */
export const CONTAINER_WIDTH_VALUES: Record<ContainerWidthStep, string> = {
  narrow: '48rem',
  regular: '64rem',
  wide: '72rem',
}

/** p-4 / p-6 / p-8 */
export const CARD_PADDING_VALUES: Record<CardPaddingStep, string> = {
  tight: '1rem',
  regular: '1.5rem',
  roomy: '2rem',
}

/** py-8 … py-24 */
export const VERTICAL_VALUES: Record<SpaceStep, string> = {
  xs: '2rem',
  s: '3rem',
  m: '4rem',
  l: '5rem',
  xl: '6rem',
}

/** px-4 … px-10 */
export const HORIZONTAL_VALUES: Record<SpaceStep, string> = {
  xs: '1rem',
  s: '1.25rem',
  m: '1.5rem',
  l: '2rem',
  xl: '2.5rem',
}

/** none / rounded / rounded-lg / rounded-2xl / rounded-full */
export const RADIUS_VALUES: Record<RadiusStep, string> = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '1rem',
  full: '9999px',
}

export const DEFAULT_SPACING_PRESETS: FrameworkSpacingPresets = {
  containerWidth: 'wide',
  cardPadding: 'regular',
  vertical: 'l',
  horizontal: 'm',
  radius: 'md',
}

const CONTAINER_SET = new Set<string>(CONTAINER_WIDTH_STEPS)
const CARD_SET = new Set<string>(CARD_PADDING_STEPS)
const SPACE_SET = new Set<string>(SPACE_STEPS)
const RADIUS_SET = new Set<string>(RADIUS_STEPS)

export function resolveSpacingPresets(
  settings: FrameworkSpacingSettings | null | undefined,
): FrameworkSpacingPresets {
  const stored = settings?.presets
  return {
    containerWidth: pick(stored?.containerWidth, CONTAINER_SET, DEFAULT_SPACING_PRESETS.containerWidth),
    cardPadding: pick(stored?.cardPadding, CARD_SET, DEFAULT_SPACING_PRESETS.cardPadding),
    vertical: pick(stored?.vertical, SPACE_SET, DEFAULT_SPACING_PRESETS.vertical),
    horizontal: pick(stored?.horizontal, SPACE_SET, DEFAULT_SPACING_PRESETS.horizontal),
    radius: pick(stored?.radius, RADIUS_SET, DEFAULT_SPACING_PRESETS.radius),
  }
}

/**
 * Site-wide spacing custom properties. Empty when the spacing module is
 * disabled. Merged into the shared `:root` block so publish still emits
 * one base root (see generate.test.ts).
 */
export function generateSpacingPresetVariables(
  settings: FrameworkSpacingSettings | null | undefined,
): Array<{ name: string; value: string }> {
  if (!settings || settings.isDisabled) return []
  const presets = resolveSpacingPresets(settings)
  return [
    { name: '--container-narrow', value: CONTAINER_WIDTH_VALUES.narrow },
    { name: '--container-regular', value: CONTAINER_WIDTH_VALUES.regular },
    { name: '--container-wide', value: CONTAINER_WIDTH_VALUES.wide },
    { name: '--container-width', value: `var(--container-${presets.containerWidth})` },
    { name: '--card-padding', value: CARD_PADDING_VALUES[presets.cardPadding] },
    { name: '--space-vertical', value: VERTICAL_VALUES[presets.vertical] },
    { name: '--space-horizontal', value: HORIZONTAL_VALUES[presets.horizontal] },
    { name: '--radius-none', value: RADIUS_VALUES.none },
    { name: '--radius-sm', value: RADIUS_VALUES.sm },
    { name: '--radius-md', value: RADIUS_VALUES.md },
    { name: '--radius-lg', value: RADIUS_VALUES.lg },
    { name: '--radius-full', value: RADIUS_VALUES.full },
    { name: '--radius', value: `var(--radius-${presets.radius})` },
    { name: '--radius-button', value: 'var(--radius)' },
    { name: '--radius-image', value: 'var(--radius)' },
    { name: '--radius-card', value: 'var(--radius)' },
  ]
}

function pick<T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T {
  return value && allowed.has(value) ? (value as T) : fallback
}
