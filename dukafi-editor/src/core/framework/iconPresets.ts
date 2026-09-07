/**
 * Site icon defaults — glyph color/weight plus the box around them.
 *
 * Quiet recipes omit rounded-* and icon-specific fills so these :where(svg)
 * rules paint inline icons. A class on a selected SVG still wins.
 */

import type { FrameworkIconsSettings } from '@core/framework-schema'

export const ICON_SLIDER_STEPS = ['1', '2', '3', '4', '5', '6', '7'] as const
export type IconSliderStep = (typeof ICON_SLIDER_STEPS)[number]

export const ICON_COLOR_ROLES = ['accent', 'heading', 'body', 'border'] as const
export type IconColorRole = (typeof ICON_COLOR_ROLES)[number]

export const DEFAULT_ICON_PRESETS: FrameworkIconsSettings = {
  color: 'accent',
  style: 'outlined',
  weight: '4',
  fill: 'outline',
  treatment: 'fill',
  fillIntensity: 'subtle',
  padding: '4',
  radius: '2',
  radiusLinked: true,
}

const WEIGHT_VALUES: Record<IconSliderStep, string> = {
  '1': '0.5',
  '2': '1',
  '3': '1.25',
  '4': '1.5',
  '5': '2',
  '6': '2.5',
  '7': '3',
}

const PADDING_VALUES: Record<IconSliderStep, string> = {
  '1': '0',
  '2': '0.25rem',
  '3': '0.375rem',
  '4': '0.5rem',
  '5': '0.75rem',
  '6': '1rem',
  '7': '1.25rem',
}

const RADIUS_VALUES: Record<IconSliderStep, string> = {
  '1': '0',
  '2': '0.125rem',
  '3': '0.25rem',
  '4': '0.5rem',
  '5': '0.75rem',
  '6': '1rem',
  '7': '9999px',
}

const COLOR_VARS: Record<IconColorRole, string> = {
  accent: 'var(--scheme-accent, currentColor)',
  heading: 'var(--scheme-heading, currentColor)',
  body: 'var(--scheme-body, currentColor)',
  border: 'var(--scheme-border, currentColor)',
}

const COLOR_SET = new Set<string>(ICON_COLOR_ROLES)
const STYLE_SET = new Set(['outlined', 'filled'])
const FILL_SET = new Set(['outline', 'fill'])
const TREATMENT_SET = new Set(['none', 'fill', 'outline'])
const INTENSITY_SET = new Set(['subtle', 'strong'])
const STEP_SET = new Set<string>(ICON_SLIDER_STEPS)

export function resolveIconPresets(
  settings: FrameworkIconsSettings | null | undefined,
): FrameworkIconsSettings {
  return {
    color: pick(settings?.color, COLOR_SET, DEFAULT_ICON_PRESETS.color),
    style: pick(settings?.style, STYLE_SET, DEFAULT_ICON_PRESETS.style),
    weight: pick(settings?.weight, STEP_SET, DEFAULT_ICON_PRESETS.weight),
    fill: pick(settings?.fill, FILL_SET, DEFAULT_ICON_PRESETS.fill),
    treatment: pick(settings?.treatment, TREATMENT_SET, DEFAULT_ICON_PRESETS.treatment),
    fillIntensity: pick(settings?.fillIntensity, INTENSITY_SET, DEFAULT_ICON_PRESETS.fillIntensity),
    padding: pick(settings?.padding, STEP_SET, DEFAULT_ICON_PRESETS.padding),
    radius: pick(settings?.radius, STEP_SET, DEFAULT_ICON_PRESETS.radius),
    radiusLinked: typeof settings?.radiusLinked === 'boolean'
      ? settings.radiusLinked
      : DEFAULT_ICON_PRESETS.radiusLinked,
  }
}

export function generateIconPresetVariables(
  settings: FrameworkIconsSettings | null | undefined,
): Array<{ name: string; value: string }> {
  const presets = resolveIconPresets(settings)
  const outlined = presets.style === 'outlined' && presets.fill === 'outline'
  const boxPadding = presets.treatment === 'none' ? '0' : PADDING_VALUES[presets.padding]
  const boxRadius = presets.radiusLinked ? 'var(--radius)' : RADIUS_VALUES[presets.radius]
  const strong = presets.fillIntensity === 'strong'
  let boxBg = 'transparent'
  let boxBorder = '0 solid transparent'
  let glyphColor = 'var(--icon-color)'
  if (presets.treatment === 'fill') {
    boxBg = strong
      ? 'var(--icon-color)'
      : 'color-mix(in srgb, var(--icon-color) 12%, transparent)'
    if (strong) glyphColor = 'var(--scheme-on-accent, var(--scheme-background, currentColor))'
  } else if (presets.treatment === 'outline') {
    boxBorder = '1px solid var(--icon-color)'
  }

  return [
    { name: '--icon-color', value: COLOR_VARS[presets.color] },
    { name: '--icon-glyph-color', value: glyphColor },
    { name: '--icon-stroke-width', value: WEIGHT_VALUES[presets.weight] },
    { name: '--icon-fill', value: outlined ? 'none' : 'currentColor' },
    { name: '--icon-stroke', value: outlined ? 'currentColor' : 'none' },
    { name: '--icon-box-padding', value: boxPadding },
    { name: '--icon-box-radius', value: boxRadius },
    { name: '--icon-box-bg', value: boxBg },
    { name: '--icon-box-border', value: boxBorder },
  ]
}

const ICON_ELEMENTS = `
:where(svg) {
  box-sizing: content-box;
  padding: var(--icon-box-padding);
  border: var(--icon-box-border);
  border-radius: var(--icon-box-radius);
  color: var(--icon-glyph-color);
  background: var(--icon-box-bg);
  fill: var(--icon-fill);
  stroke: var(--icon-stroke);
  stroke-width: var(--icon-stroke-width);
  stroke-linecap: round;
  stroke-linejoin: round;
}
`.trim()

export function generateIconCss(
  settings: FrameworkIconsSettings | null | undefined,
  enabled: boolean,
): string {
  if (!enabled) return ''
  return ICON_ELEMENTS
}

function pick<T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T {
  return value && allowed.has(value) ? (value as T) : fallback
}
