/** Site-wide button defaults. `.dukafi-button` is zero-specificity so an
 * authored class or a per-node property always wins. */
import type { FrameworkButtonsSettings } from '@core/framework-schema'

export const BUTTON_SLIDER_STEPS = ['1', '2', '3', '4', '5', '6', '7'] as const
export type ButtonSliderStep = (typeof BUTTON_SLIDER_STEPS)[number]
export type ButtonAppearance = 'primary' | 'secondary' | 'link'
export type ButtonColorRole = 'accent' | 'secondary' | 'heading' | 'body' | 'border'

export const DEFAULT_BUTTON_PRESETS: FrameworkButtonsSettings = {
  primaryColor: 'accent', secondaryColor: 'secondary', linkColor: 'accent',
  padding: '4', radius: '4', radiusLinked: true, fontVariable: 'inherit',
  fontSize: '4', fontWeight: '5', casing: 'normal', letterSpacing: '4',
}

const STEP = new Set<string>(BUTTON_SLIDER_STEPS)
const ROLE = new Set(['accent', 'secondary', 'heading', 'body', 'border'])
const CASING = new Set(['normal', 'capitalize', 'uppercase'])
const PADDING: Record<ButtonSliderStep, string> = {
  '1': '.375rem .625rem', '2': '.5rem .75rem', '3': '.625rem .875rem',
  '4': '.75rem 1rem', '5': '.875rem 1.25rem', '6': '1rem 1.5rem', '7': '1.125rem 1.75rem',
}
const RADIUS: Record<ButtonSliderStep, string> = {
  '1': '0', '2': '.125rem', '3': '.25rem', '4': '.5rem', '5': '.75rem', '6': '1rem', '7': '9999px',
}
const SIZE: Record<ButtonSliderStep, string> = {
  '1': '.75rem', '2': '.8125rem', '3': '.875rem', '4': '1rem', '5': '1.125rem', '6': '1.25rem', '7': '1.5rem',
}
const WEIGHT: Record<ButtonSliderStep, string> = {
  '1': '300', '2': '400', '3': '450', '4': '500', '5': '600', '6': '700', '7': '800',
}
const TRACKING: Record<ButtonSliderStep, string> = {
  '1': '-.04em', '2': '-.025em', '3': '-.0125em', '4': '0', '5': '.025em', '6': '.05em', '7': '.1em',
}

function pick<T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T {
  return value && allowed.has(value) ? value as T : fallback
}

export function resolveButtonPresets(value?: FrameworkButtonsSettings | null): FrameworkButtonsSettings {
  const fontVariable = value?.fontVariable?.trim() || 'inherit'
  return {
    primaryColor: pick(value?.primaryColor, ROLE, DEFAULT_BUTTON_PRESETS.primaryColor),
    secondaryColor: pick(value?.secondaryColor, ROLE, DEFAULT_BUTTON_PRESETS.secondaryColor),
    linkColor: pick(value?.linkColor, ROLE, DEFAULT_BUTTON_PRESETS.linkColor),
    padding: pick(value?.padding, STEP, DEFAULT_BUTTON_PRESETS.padding),
    radius: pick(value?.radius, STEP, DEFAULT_BUTTON_PRESETS.radius),
    radiusLinked: typeof value?.radiusLinked === 'boolean' ? value.radiusLinked : true,
    fontVariable: fontVariable === 'inherit' || /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(fontVariable)
      ? fontVariable
      : 'inherit',
    fontSize: pick(value?.fontSize, STEP, DEFAULT_BUTTON_PRESETS.fontSize),
    fontWeight: pick(value?.fontWeight, STEP, DEFAULT_BUTTON_PRESETS.fontWeight),
    casing: pick(value?.casing, CASING, DEFAULT_BUTTON_PRESETS.casing),
    letterSpacing: pick(value?.letterSpacing, STEP, DEFAULT_BUTTON_PRESETS.letterSpacing),
  }
}

export function buttonRoleVariable(role: ButtonColorRole | 'background'): string {
  return `var(--scheme-${role}, currentColor)`
}

export function generateButtonPresetVariables(value?: FrameworkButtonsSettings | null) {
  const p = resolveButtonPresets(value)
  const font = p.fontVariable === 'inherit' ? 'inherit' : `var(--${p.fontVariable}, inherit)`
  return [
    { name: '--button-primary-color', value: buttonRoleVariable(p.primaryColor) },
    { name: '--button-secondary-color', value: buttonRoleVariable(p.secondaryColor) },
    { name: '--button-link-color', value: buttonRoleVariable(p.linkColor) },
    { name: '--button-padding', value: PADDING[p.padding] },
    { name: '--button-radius', value: p.radiusLinked ? 'var(--radius-button, .5rem)' : RADIUS[p.radius] },
    { name: '--button-font-family', value: font },
    { name: '--button-font-size', value: SIZE[p.fontSize] },
    { name: '--button-font-weight', value: WEIGHT[p.fontWeight] },
    { name: '--button-text-transform', value: p.casing === 'normal' ? 'none' : p.casing },
    { name: '--button-letter-spacing', value: TRACKING[p.letterSpacing] },
  ]
}

export function generateButtonCss(enabled: boolean): string {
  if (!enabled) return ''
  return `:where(.dukafi-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--button-padding);
  border: 1px solid transparent;
  border-radius: var(--button-radius);
  font-family: var(--button-font-family);
  font-size: var(--button-font-size);
  font-weight: var(--button-font-weight);
  letter-spacing: var(--button-letter-spacing);
  line-height: 1;
  text-transform: var(--button-text-transform);
  text-decoration: none;
  cursor: pointer;
  background: var(--button-primary-color);
  color: var(--scheme-on-accent, var(--scheme-background, white));
}
:where(.dukafi-button.button-secondary) { background: var(--button-secondary-color); color: var(--scheme-heading, currentColor); border-color: var(--scheme-border, currentColor); }
:where(.dukafi-button.button-link) { padding-inline: 0; background: transparent; color: var(--button-link-color); }`
}
