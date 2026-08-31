import type { StyleRule } from '@core/page-tree'
import type {
  FrameworkColorSchemeSettings,
  FrameworkColorSettings,
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

export interface FrameworkGenerationSettings {
  colors?: FrameworkColorSettings | null
  colorSchemes?: FrameworkColorSchemeSettings | null
  typography?: FrameworkTypographySettings | null
  spacing?: FrameworkSpacingSettings | null
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
function composeFrameworkRootCss(
  colorVariables: FrameworkColorVariableSets,
  scaleVariables: FrameworkScaleVariable[],
  typography?: FrameworkTypographySettings | null,
): string {
  return [
    formatCssVariableBlock(':root', [...colorVariables.light, ...scaleVariables]),
    formatFrameworkColorThemeCss(colorVariables),
    generateTypeStyleCss(typography),
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
    settings?.typography,
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
    ], settings?.typography),
    utilityClasses: {
      ...colors.utilityClasses,
      ...generateColorSchemeClasses(settings?.colorSchemes, settings?.colors),
      ...typography.utilityClasses,
      ...spacing.utilityClasses,
    },
  }
}
