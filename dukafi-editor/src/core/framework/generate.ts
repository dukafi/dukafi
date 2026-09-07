import type { StyleRule } from '@core/page-tree'
import type {
  FrameworkColorSchemeSettings,
  FrameworkColorSettings,
  FrameworkIconsSettings,
  FrameworkButtonsSettings,
  FrameworkInputsSettings,
  FrameworkPreferencesSettings,
  FrameworkSpacingSettings,
  FrameworkTypographySettings,
} from '@core/framework-schema'
import type { FrameworkColorVariableSets } from './colors'
import {
  formatFrameworkColorThemeCss,
  generateFrameworkColorPlan,
  generateFrameworkColorUtilityClasses,
  generateFrameworkColorVariableSets,
} from './colors'
import type { FrameworkScaleVariable } from './scaleModule'
import {
  generateFrameworkTypographyPlan,
  generateFrameworkTypographyUtilityClasses,
  generateFrameworkTypographyVariables,
} from './typography'
import {
  generateFrameworkSpacingPlan,
  generateFrameworkSpacingUtilityClasses,
  generateFrameworkSpacingVariables,
} from './spacing'
import { resolveFrameworkPreferences } from './preferences'
import { formatCssVariableBlock } from './cssVariables'
import { generateColorSchemeClasses } from './colorSchemes'
import { generateTypeStyleCss } from './typeStyles'
import { generateSpacingPresetVariables } from './spacingPresets'
import { generateRadiusCss } from './radius'
import { generateIconCss, generateIconPresetVariables } from './iconPresets'
import { generateButtonCss, generateButtonPresetVariables } from './buttonPresets'
import { generateInputCss, generateInputPresetVariables } from './inputPresets'

export interface FrameworkGenerationSettings {
  colors?: FrameworkColorSettings | null
  colorSchemes?: FrameworkColorSchemeSettings | null
  typography?: FrameworkTypographySettings | null
  spacing?: FrameworkSpacingSettings | null
  icons?: FrameworkIconsSettings | null
  buttons?: FrameworkButtonsSettings | null
  inputs?: FrameworkInputsSettings | null
  preferences?: FrameworkPreferencesSettings | null
}

/**
 * The two framework CSS outputs the publisher needs, built together: the merged
 * `:root` variable block (+ color theme scopes) and the locked utility classes.
 */
interface FrameworkPlan {
  rootCss: string
  utilityClasses: Record<string, StyleRule>
}

/**
 * Compose the `:root` block from the color variable sets and the scale
 * variables. Shared by `generateFrameworkRootCss` (single output) and
 * `buildFrameworkPlan` (both outputs) so they stay byte-identical.
 */
function spacingPresetSource(
  typography?: FrameworkTypographySettings | null,
  spacing?: FrameworkSpacingSettings | null,
): FrameworkSpacingSettings | null {
  if (spacing?.isDisabled) return spacing
  if (spacing) return spacing
  if (typography && !typography.isDisabled) return { groups: [] }
  return null
}

function iconsEnabled(settings: FrameworkGenerationSettings | null | undefined): boolean {
  if (settings?.icons) return true
  if (settings?.spacing && !settings.spacing.isDisabled) return true
  if (settings?.typography && !settings.typography.isDisabled) return true
  return false
}

function buttonsEnabled(settings: FrameworkGenerationSettings | null | undefined): boolean {
  return Boolean(settings?.buttons || settings?.inputs) || iconsEnabled(settings)
}

function composeFrameworkRootCss(
  colorVariables: FrameworkColorVariableSets,
  scaleVariables: FrameworkScaleVariable[],
  settings?: FrameworkGenerationSettings | null,
): string {
  const spacing = spacingPresetSource(settings?.typography, settings?.spacing)
  const iconOn = iconsEnabled(settings)
  const buttonOn = buttonsEnabled(settings)
  return [
    formatCssVariableBlock(':root', [
      ...colorVariables.light,
      ...scaleVariables,
      ...generateSpacingPresetVariables(spacing),
      ...(iconOn ? generateIconPresetVariables(settings?.icons) : []),
      ...(buttonOn ? generateButtonPresetVariables(settings?.buttons) : []),
      ...(buttonOn ? generateInputPresetVariables(settings?.inputs) : []),
    ]),
    formatFrameworkColorThemeCss(colorVariables),
    generateTypeStyleCss(settings?.typography),
    generateRadiusCss(spacing),
    generateIconCss(settings?.icons, iconOn),
    generateButtonCss(buttonOn),
    generateInputCss(buttonOn),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function generateFrameworkRootCss(
  settings: FrameworkGenerationSettings | null | undefined,
): string {
  const preferences = resolveFrameworkPreferences(settings?.preferences)
  return composeFrameworkRootCss(
    generateFrameworkColorVariableSets(settings?.colors),
    [
      ...generateFrameworkTypographyVariables(settings?.typography, preferences),
      ...generateFrameworkSpacingVariables(settings?.spacing, preferences),
    ],
    settings,
  )
}

export function generateFrameworkUtilityClasses(
  settings: FrameworkGenerationSettings | null | undefined,
): Record<string, StyleRule> {
  return {
    ...generateFrameworkColorUtilityClasses(settings?.colors),
    ...generateColorSchemeClasses(settings?.colorSchemes, settings?.colors),
    ...generateFrameworkTypographyUtilityClasses(settings?.typography),
    ...generateFrameworkSpacingUtilityClasses(settings?.spacing),
  }
}

/**
 * Build the framework `:root` CSS and utility classes in one pass.
 *
 * Each family's variable + utility outputs are derived from a single shared,
 * ordered enumeration (`generateFramework*Plan`), so a publish walks each
 * family's tokens/groups once per pass instead of once per output. Equivalent
 * to `{ rootCss: generateFrameworkRootCss(s), utilityClasses: generateFrameworkUtilityClasses(s) }`
 * but without the duplicated traversals.
 */
export function buildFrameworkPlan(
  settings: FrameworkGenerationSettings | null | undefined,
): FrameworkPlan {
  const preferences = resolveFrameworkPreferences(settings?.preferences)
  const colors = generateFrameworkColorPlan(settings?.colors)
  const typography = generateFrameworkTypographyPlan(settings?.typography, preferences)
  const spacing = generateFrameworkSpacingPlan(settings?.spacing, preferences)

  return {
    rootCss: composeFrameworkRootCss(colors.variableSets, [
      ...typography.variables,
      ...spacing.variables,
    ], settings),
    utilityClasses: {
      ...colors.utilityClasses,
      ...generateColorSchemeClasses(settings?.colorSchemes, settings?.colors),
      ...typography.utilityClasses,
      ...spacing.utilityClasses,
    },
  }
}
