/** Site-wide form-field defaults. Platform hooks carry `.dukafi-input`; the
 * generated rules use :where() so authored classes and inline styles win. */
import type { FrameworkInputsSettings } from '@core/framework-schema'
import { BUTTON_SLIDER_STEPS, buttonRoleVariable, type ButtonColorRole, type ButtonSliderStep } from './buttonPresets'

export { BUTTON_SLIDER_STEPS as INPUT_SLIDER_STEPS }
export type InputSliderStep = ButtonSliderStep
export type InputColorRole = ButtonColorRole | 'background'

export const DEFAULT_INPUT_PRESETS: FrameworkInputsSettings = {
  backgroundColor: 'background', textColor: 'body', borderColor: 'border', focusColor: 'accent',
  padding: '4', radius: '4', radiusLinked: true, borderWidth: '2',
  fontVariable: 'inherit', fontSize: '4', fontWeight: '2',
}

const STEP = new Set<string>(BUTTON_SLIDER_STEPS)
const ROLE = new Set(['background', 'accent', 'secondary', 'heading', 'body', 'border'])
const PADDING: Record<ButtonSliderStep, string> = {
  '1': '.375rem .5rem', '2': '.5rem .625rem', '3': '.625rem .75rem', '4': '.75rem .875rem',
  '5': '.875rem 1rem', '6': '1rem 1.125rem', '7': '1.125rem 1.25rem',
}
const RADIUS: Record<ButtonSliderStep, string> = {
  '1': '0', '2': '.125rem', '3': '.25rem', '4': '.5rem', '5': '.75rem', '6': '1rem', '7': '9999px',
}
const BORDER: Record<ButtonSliderStep, string> = {
  '1': '0', '2': '1px', '3': '1.5px', '4': '2px', '5': '2.5px', '6': '3px', '7': '4px',
}
const SIZE: Record<ButtonSliderStep, string> = {
  '1': '.75rem', '2': '.8125rem', '3': '.875rem', '4': '1rem', '5': '1.125rem', '6': '1.25rem', '7': '1.5rem',
}
const WEIGHT: Record<ButtonSliderStep, string> = {
  '1': '300', '2': '400', '3': '450', '4': '500', '5': '600', '6': '700', '7': '800',
}

function pick<T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T {
  return value && allowed.has(value) ? value as T : fallback
}

export function resolveInputPresets(value?: FrameworkInputsSettings | null): FrameworkInputsSettings {
  const fontVariable = value?.fontVariable?.trim() || 'inherit'
  return {
    backgroundColor: pick(value?.backgroundColor, ROLE, DEFAULT_INPUT_PRESETS.backgroundColor),
    textColor: pick(value?.textColor, ROLE, DEFAULT_INPUT_PRESETS.textColor),
    borderColor: pick(value?.borderColor, ROLE, DEFAULT_INPUT_PRESETS.borderColor),
    focusColor: pick(value?.focusColor, ROLE, DEFAULT_INPUT_PRESETS.focusColor),
    padding: pick(value?.padding, STEP, DEFAULT_INPUT_PRESETS.padding),
    radius: pick(value?.radius, STEP, DEFAULT_INPUT_PRESETS.radius),
    radiusLinked: typeof value?.radiusLinked === 'boolean' ? value.radiusLinked : true,
    borderWidth: pick(value?.borderWidth, STEP, DEFAULT_INPUT_PRESETS.borderWidth),
    fontVariable: fontVariable === 'inherit' || /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(fontVariable) ? fontVariable : 'inherit',
    fontSize: pick(value?.fontSize, STEP, DEFAULT_INPUT_PRESETS.fontSize),
    fontWeight: pick(value?.fontWeight, STEP, DEFAULT_INPUT_PRESETS.fontWeight),
  }
}

export function generateInputPresetVariables(value?: FrameworkInputsSettings | null) {
  const p = resolveInputPresets(value)
  const font = p.fontVariable === 'inherit' ? 'inherit' : `var(--${p.fontVariable}, inherit)`
  return [
    { name: '--input-background', value: buttonRoleVariable(p.backgroundColor) },
    { name: '--input-color', value: buttonRoleVariable(p.textColor) },
    { name: '--input-border-color', value: buttonRoleVariable(p.borderColor) },
    { name: '--input-focus-color', value: buttonRoleVariable(p.focusColor) },
    { name: '--input-padding', value: PADDING[p.padding] },
    { name: '--input-radius', value: p.radiusLinked ? 'var(--radius-button, .5rem)' : RADIUS[p.radius] },
    { name: '--input-border-width', value: BORDER[p.borderWidth] },
    { name: '--input-font-family', value: font },
    { name: '--input-font-size', value: SIZE[p.fontSize] },
    { name: '--input-font-weight', value: WEIGHT[p.fontWeight] },
  ]
}

export function generateInputCss(enabled: boolean): string {
  if (!enabled) return ''
  return `:where(.dukafi-input) {
  box-sizing: border-box;
  width: 100%;
  padding: var(--input-padding);
  border: var(--input-border-width) solid var(--input-border-color);
  border-radius: var(--input-radius);
  background: var(--input-background);
  color: var(--input-color);
  font-family: var(--input-font-family);
  font-size: var(--input-font-size);
  font-weight: var(--input-font-weight);
  line-height: 1.4;
}
:where(.dukafi-input)::placeholder { color: var(--scheme-body, currentColor); opacity: .6; }
:where(.dukafi-input):focus-visible { outline: 2px solid var(--input-focus-color); outline-offset: 2px; }`
}
