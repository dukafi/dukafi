/**
 * Default seed values for the framework typography and spacing panels.
 *
 * These mirror the Core Framework `TYPOGRAPHY_INITIAL_STATE` /
 * `SPACING_CALCULATOR_INITIAL_STATE` byte-for-byte (modulo IDs which we
 * generate at seed time). Don't drift them — the defaults are what users
 * compare against when migrating between the two systems.
 */

import { nanoid } from 'nanoid'
import type {
  FrameworkScaleManualSize,
  FrameworkSpacingClassGenerator,
  FrameworkSpacingGroup,
  FrameworkSpacingSettings,
  FrameworkTypographyClassGenerator,
  FrameworkTypographyGroup,
  FrameworkTypographySettings,
} from '@core/framework-schema'

const NEW_TYPOGRAPHY_TAB_NAME = 'Typography'
const NEW_TYPOGRAPHY_VAR_NAME = 'text'
const NEW_SPACING_TAB_NAME = 'Spacing'
const NEW_SPACING_VAR_NAME = 'space'

interface ManualSeed {
  name: string
  min: number
  max: number
}

/** Verbatim from Core Framework TYPOGRAPHY_INITIAL_STATE.groups[0].manualSizes. */
const TYPOGRAPHY_MANUAL_SEED: ManualSeed[] = [
  { name: 'text-xs',  min: 12.64, max: 10.13 },
  { name: 'text-s',   min: 14.22, max: 13.5 },
  { name: 'text-m',   min: 16,    max: 18 },
  { name: 'text-l',   min: 18,    max: 23.99 },
  { name: 'text-xl',  min: 20.25, max: 31.98 },
  { name: 'text-2xl', min: 22.78, max: 42.63 },
  { name: 'text-3xl', min: 25.63, max: 56.83 },
  { name: 'text-4xl', min: 28.83, max: 75.76 },
]

/** Verbatim from Core Framework SPACING_CALCULATOR_INITIAL_STATE.groups[0].manualSizes. */
const SPACING_MANUAL_SEED: ManualSeed[] = [
  { name: 'space-4xs', min: 5.24,  max: 4.95 },
  { name: 'space-3xs', min: 6.55,  max: 7 },
  { name: 'space-2xs', min: 8.19,  max: 9.9 },
  { name: 'space-xs',  min: 10.24, max: 14 },
  { name: 'space-s',   min: 12.8,  max: 19.8 },
  { name: 'space-m',   min: 16,    max: 28 },
  { name: 'space-l',   min: 20,    max: 39.59 },
  { name: 'space-xl',  min: 25,    max: 55.98 },
  { name: 'space-2xl', min: 31.25, max: 79.16 },
  { name: 'space-3xl', min: 39.06, max: 111.93 },
  { name: 'space-4xl', min: 48.83, max: 158.27 },
]

function freshManualSizes(seed: ManualSeed[]): FrameworkScaleManualSize[] {
  return seed.map((s) => ({ id: nanoid(), name: s.name, min: s.min, max: s.max }))
}

export function buildDefaultTypographyGroup(order = 0): FrameworkTypographyGroup {
  const now = Date.now()
  return {
    id: nanoid(),
    name: NEW_TYPOGRAPHY_TAB_NAME,
    namingConvention: NEW_TYPOGRAPHY_VAR_NAME,
    min: { fontSize: 16, scaleRatio: 1.125 },
    max: { fontSize: 18, scaleRatio: 1.333 },
    steps: 'xs,s,m,l,xl,2xl,3xl,4xl',
    baseScaleIndex: 2,
    mode: 'fluid',
    manualSizes: freshManualSizes(TYPOGRAPHY_MANUAL_SEED),
    order,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildDefaultSpacingGroup(order = 0): FrameworkSpacingGroup {
  const now = Date.now()
  return {
    id: nanoid(),
    name: NEW_SPACING_TAB_NAME,
    namingConvention: NEW_SPACING_VAR_NAME,
    min: { size: 16, scaleRatio: 1.25 },
    max: { size: 28, scaleRatio: 1.414, isCustomScaleRatio: false, scaleRatioInputValue: 1.333 },
    steps: '4xs,3xs,2xs,xs,s,m,l,xl,2xl,3xl,4xl',
    baseScaleIndex: 5,
    mode: 'fluid',
    manualSizes: freshManualSizes(SPACING_MANUAL_SEED),
    order,
    createdAt: now,
    updatedAt: now,
  }
}

function buildDefaultTypographyClassGenerators(tabId: string): FrameworkTypographyClassGenerator[] {
  return [
    { id: nanoid(), tabId, name: 'text-*', property: ['font-size'] },
  ]
}

/** Verbatim from Core Framework SPACING_CALCULATOR_INITIAL_STATE.classes (sans the leading dot). */
function buildDefaultSpacingClassGenerators(tabId: string): FrameworkSpacingClassGenerator[] {
  const make = (name: string, property: string[]): FrameworkSpacingClassGenerator => ({
    id: nanoid(),
    tabId,
    name,
    property,
  })
  // The `padding-*` / `margin-*` generators expand to all four sides — there
  // is no shorthand `padding`/`margin` key in CSSPropertyBag, so a "set
  // padding on every side" utility class writes the four per-side keys. The
  // publisher then collapses them back into a `padding: var(--space-md);`
  // shorthand at emission time.
  return [
    make('padding-*',            ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']),
    make('padding-left-*',       ['padding-left']),
    make('padding-right-*',      ['padding-right']),
    make('padding-top-*',        ['padding-top']),
    make('padding-bottom-*',     ['padding-bottom']),
    make('padding-horizontal-*', ['padding-left', 'padding-right']),
    make('padding-vertical-*',   ['padding-top', 'padding-bottom']),
    make('margin-*',             ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']),
    make('margin-left-*',        ['margin-left']),
    make('margin-right-*',       ['margin-right']),
    make('margin-top-*',         ['margin-top']),
    make('margin-bottom-*',      ['margin-bottom']),
    make('margin-horizontal-*',  ['margin-left', 'margin-right']),
    make('margin-vertical-*',    ['margin-top', 'margin-bottom']),
    make('gap-*', ['gap']),
  ]
}

export function buildDefaultTypographySettings(): FrameworkTypographySettings {
  const group = buildDefaultTypographyGroup()
  return {
    groups: [group],
    classes: buildDefaultTypographyClassGenerators(group.id),
  }
}

export function buildDefaultSpacingSettings(): FrameworkSpacingSettings {
  const group = buildDefaultSpacingGroup()
  return {
    groups: [group],
    classes: buildDefaultSpacingClassGenerators(group.id),
  }
}

/** Generate the next "Typography N" / variable "text-N" pair for a fresh tab. */
export function nextTypographyTabValues(existing: FrameworkTypographyGroup[]): { name: string; varName: string } {
  const count =
    existing.filter((g) => g.name.toLowerCase().startsWith(NEW_TYPOGRAPHY_TAB_NAME.toLowerCase())).length + 1
  return {
    name: `${NEW_TYPOGRAPHY_TAB_NAME} ${count}`,
    varName: `${NEW_TYPOGRAPHY_VAR_NAME}-${count}`,
  }
}

export function nextSpacingTabValues(existing: FrameworkSpacingGroup[]): { name: string; varName: string } {
  const count =
    existing.filter((g) => g.name.toLowerCase().startsWith(NEW_SPACING_TAB_NAME.toLowerCase())).length + 1
  return {
    name: `${NEW_SPACING_TAB_NAME} ${count}`,
    varName: `${NEW_SPACING_VAR_NAME}-${count}`,
  }
}

export function makeFreshTypographyGroup(name: string, varName: string, order: number): FrameworkTypographyGroup {
  const base = buildDefaultTypographyGroup(order)
  return {
    ...base,
    name,
    namingConvention: varName,
    manualSizes: TYPOGRAPHY_MANUAL_SEED.map((s) => ({
      id: nanoid(),
      name: s.name.replace(NEW_TYPOGRAPHY_VAR_NAME, varName),
      min: s.min,
      max: s.max,
    })),
  }
}

export function makeFreshSpacingGroup(name: string, varName: string, order: number): FrameworkSpacingGroup {
  const base = buildDefaultSpacingGroup(order)
  return {
    ...base,
    name,
    namingConvention: varName,
    manualSizes: SPACING_MANUAL_SEED.map((s) => ({
      id: nanoid(),
      name: s.name.replace(NEW_SPACING_VAR_NAME, varName),
      min: s.min,
      max: s.max,
    })),
  }
}
