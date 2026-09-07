/**
 * Framework — TypeBox schemas and derived types.
 *
 * Schemas are the source of truth. Types are derived via `Static<typeof Schema>`.
 * No parallel TypeScript interfaces — schema definitions ARE the contract.
 *
 * Resilient parsing semantics replicate `src/core/persistence/validate.ts`
 * (lines ~282–570) so these schemas are ready to replace the hand-rolled
 * validators in Step 5 without behavioural change.
 *
 * Fallback semantics
 * ------------------
 * `withFallback(schema, value)` annotates a schema with a default used by
 * `parseWithFallbackAnnotation`. For dynamic defaults (createdAt / updatedAt
 * with `Date.now()`), the annotation carries the static sentinel `0`; callers
 * that need a live timestamp supply it themselves in a parser helper.
 */

import { Type, type Static } from '@sinclair/typebox'
import { withFallback } from '@core/utils/typeboxHelpers'

// ---------------------------------------------------------------------------
// FrameworkColorUtilityType
// ---------------------------------------------------------------------------

const FrameworkColorUtilityTypeSchema = Type.Union([
  Type.Literal('text'),
  Type.Literal('background'),
  Type.Literal('border'),
  Type.Literal('fill'),
])

export type FrameworkColorUtilityType = Static<typeof FrameworkColorUtilityTypeSchema>

// ---------------------------------------------------------------------------
// GeneratedClassMetadata — discriminated union on `family`
// ---------------------------------------------------------------------------

const GeneratedColorClassMetadataSchema = Type.Object({
  origin: Type.Literal('framework'),
  family: Type.Literal('color'),
  sourceId: Type.String(),
  utility: FrameworkColorUtilityTypeSchema,
  tokenName: Type.String(),
  variantName: Type.Optional(Type.String()),
  locked: Type.Literal(true),
})


const GeneratedTypographyClassMetadataSchema = Type.Object({
  origin: Type.Literal('framework'),
  family: Type.Literal('typography'),
  /** ID of the FrameworkTypographyGroup this class was generated from. */
  sourceId: Type.String(),
  /** ID of the FrameworkTypographyClassGenerator (the row in the Class Generator). */
  generatorId: Type.String(),
  /** namingConvention of the source group (e.g. "text"). */
  tokenName: Type.String(),
  /** Step suffix from the group's `steps` string (e.g. "xs", "m"). */
  step: Type.String(),
  locked: Type.Literal(true),
})


const GeneratedSpacingClassMetadataSchema = Type.Object({
  origin: Type.Literal('framework'),
  family: Type.Literal('spacing'),
  sourceId: Type.String(),
  generatorId: Type.String(),
  tokenName: Type.String(),
  step: Type.String(),
  locked: Type.Literal(true),
})

const GeneratedSchemeClassMetadataSchema = Type.Object({
  origin: Type.Literal('framework'),
  family: Type.Literal('scheme'),
  sourceId: Type.String(),
  tokenName: Type.String(),
  locked: Type.Literal(true),
})


/**
 * Discriminated union of all framework-generated class metadata.
 * Discriminator key: `family` (TypeBox infers from `Type.Literal` keys).
 */
export const GeneratedClassMetadataSchema = Type.Union([
  GeneratedColorClassMetadataSchema,
  GeneratedTypographyClassMetadataSchema,
  GeneratedSpacingClassMetadataSchema,
  GeneratedSchemeClassMetadataSchema,
])


// ---------------------------------------------------------------------------
// FrameworkColorToken and FrameworkColorSettings
// ---------------------------------------------------------------------------

/**
 * Per-utility enabled/disabled flags.
 * Defaults: text + background + border = true, fill = false.
 * validate.ts: validateFrameworkColorUtilities()
 */
const FrameworkColorUtilitiesSchema = withFallback(
  Type.Object({
    text: withFallback(Type.Boolean(), true),
    background: withFallback(Type.Boolean(), true),
    border: withFallback(Type.Boolean(), true),
    fill: withFallback(Type.Boolean(), false),
  }),
  { text: true, background: true, border: true, fill: false },
)

/**
 * Shade / tint variant generation options.
 * Default count is 4 (DEFAULT_COLOR_VARIANT_COUNT in validate.ts).
 * validate.ts: validateFrameworkColorVariantOptions()
 */
const FrameworkColorVariantOptionsSchema = withFallback(
  Type.Object({
    enabled: withFallback(Type.Boolean(), true),
    count: withFallback(Type.Number(), 4),
  }),
  { enabled: true, count: 4 },
)

const FrameworkColorTokenSchema = Type.Object({
  id: Type.String(),
  /**
   * Free-form category label. Empty string means "uncategorized".
   * Falls back to '' when missing.
   */
  category: withFallback(Type.String(), ''),
  /** Normalized slug — used as the CSS variable name root (e.g. "primary"). */
  slug: Type.String(),
  lightValue: Type.String(),
  /** Falls back to '' when missing; validate.ts generates via generateDefaultDarkColor(). */
  darkValue: withFallback(Type.String(), ''),
  darkModeEnabled: withFallback(Type.Boolean(), false),
  generateUtilities: FrameworkColorUtilitiesSchema,
  generateTransparent: withFallback(Type.Boolean(), true),
  generateShades: FrameworkColorVariantOptionsSchema,
  generateTints: FrameworkColorVariantOptionsSchema,
  /** Falls back to 0; validate.ts uses array index as default. */
  order: withFallback(Type.Number(), 0),
  // Dynamic `Date.now()` default replaced with static 0; callers that need a
  // live timestamp supply it in a parser helper.
  createdAt: withFallback(Type.Number(), 0),
  updatedAt: withFallback(Type.Number(), 0),
})

export type FrameworkColorToken = Static<typeof FrameworkColorTokenSchema>

const FrameworkColorSettingsSchema = Type.Object({
  tokens: withFallback(Type.Array(FrameworkColorTokenSchema), []),
})

export type FrameworkColorSettings = Static<typeof FrameworkColorSettingsSchema>

export const COLOR_SCHEME_ROLES = [
  'background',
  'secondary',
  'heading',
  'body',
  'accent',
  'border',
] as const

export type ColorSchemeRole = (typeof COLOR_SCHEME_ROLES)[number]

const FrameworkColorSchemeRolesSchema = Type.Object({
  background: Type.String(),
  secondary: Type.String(),
  heading: Type.String(),
  body: Type.String(),
  accent: Type.String(),
  border: Type.String(),
})

export type FrameworkColorSchemeRoles = Static<typeof FrameworkColorSchemeRolesSchema>

export const FrameworkColorSchemeSchema = Type.Object({
  id: Type.String(),
  slug: Type.String(),
  name: Type.String(),
  order: withFallback(Type.Number(), 0),
  roles: FrameworkColorSchemeRolesSchema,
})

export type FrameworkColorScheme = Static<typeof FrameworkColorSchemeSchema>

export const FrameworkColorSchemeSettingsSchema = Type.Object({
  schemes: withFallback(Type.Array(FrameworkColorSchemeSchema), []),
})

export type FrameworkColorSchemeSettings = Static<typeof FrameworkColorSchemeSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkScaleMode
// ---------------------------------------------------------------------------

const FrameworkScaleModeSchema = Type.Union([
  Type.Literal('fluid'),
  Type.Literal('fluid_manual'),
])

export type FrameworkScaleMode = Static<typeof FrameworkScaleModeSchema>

// ---------------------------------------------------------------------------
// FrameworkScaleBreakpointConfig and family-specific extensions
// ---------------------------------------------------------------------------

/**
 * Shared breakpoint config carried by both typography and spacing groups.
 * validate.ts: inline in validateFrameworkTypographyGroup / validateFrameworkSpacingGroup.
 */
const FrameworkScaleBreakpointConfigSchema = Type.Object({
  /** Per-breakpoint scale ratio — a preset string or a raw number. */
  scaleRatio: Type.Union([Type.Number(), Type.String()]),
  /** When true, scaleRatioInputValue overrides scaleRatio. */
  isCustomScaleRatio: Type.Optional(Type.Boolean()),
  scaleRatioInputValue: Type.Optional(Type.Number()),
})


const FrameworkTypographyBreakpointConfigSchema = Type.Object({
  ...FrameworkScaleBreakpointConfigSchema.properties,
  /** Base font size at this breakpoint in px. */
  fontSize: Type.Number(),
})


const FrameworkSpacingBreakpointConfigSchema = Type.Object({
  ...FrameworkScaleBreakpointConfigSchema.properties,
  /** Base spacing size at this breakpoint in px. */
  size: Type.Number(),
})


// ---------------------------------------------------------------------------
// FrameworkScaleManualSize
// ---------------------------------------------------------------------------

const FrameworkScaleManualSizeSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  min: Type.Number(),
  max: Type.Number(),
})

export type FrameworkScaleManualSize = Static<typeof FrameworkScaleManualSizeSchema>

// ---------------------------------------------------------------------------
// Scale group base — fields shared between typography and spacing groups
//
// Duplication elimination: validateFrameworkTypographyGroup and
// validateFrameworkSpacingGroup in validate.ts share ~11 identical fields
// (id, name, mode, manualSizes, isDisabled, order, createdAt, updatedAt).
// Expressed here as a base schema extended with family-specific size fields,
// per-family naming and step defaults, and per-position scaleRatio defaults.
// ---------------------------------------------------------------------------

const FrameworkScaleGroupBaseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  /** 'fluid' (automatic) or 'fluid_manual' (manual sizes). Falls back to 'fluid'. */
  mode: withFallback(FrameworkScaleModeSchema, 'fluid' as const),
  /** Manual mode entries — consulted only when mode === 'fluid_manual'. */
  manualSizes: Type.Optional(Type.Array(FrameworkScaleManualSizeSchema)),
  isDisabled: Type.Optional(Type.Boolean()),
  /** Falls back to 0; validate.ts uses array index as default. */
  order: withFallback(Type.Number(), 0),
  // Dynamic `Date.now()` default replaced with static 0; callers that need a
  // live timestamp supply it in a parser helper.
  createdAt: withFallback(Type.Number(), 0),
  updatedAt: withFallback(Type.Number(), 0),
})

// ─── Typography group ─────────────────────────────────────────────────────────

/**
 * Per-position breakpoint configs for typography groups.
 * min.scaleRatio defaults to 1.125 (Major Second),
 * max.scaleRatio defaults to 1.333 (Perfect Fourth).
 * validate.ts: validateFrameworkTypographyGroup(), lines ~408–428.
 */
const TypographyMinBreakpointSchema = Type.Object({
  ...FrameworkTypographyBreakpointConfigSchema.properties,
  scaleRatio: withFallback(Type.Union([Type.Number(), Type.String()]), 1.125),
})

const TypographyMaxBreakpointSchema = Type.Object({
  ...FrameworkTypographyBreakpointConfigSchema.properties,
  scaleRatio: withFallback(Type.Union([Type.Number(), Type.String()]), 1.333),
})

const FrameworkTypographyGroupSchema = Type.Object({
  ...FrameworkScaleGroupBaseSchema.properties,
  /** Variable prefix — e.g. "text" produces --text-xs, --text-m, … */
  namingConvention: withFallback(Type.String(), 'text'),
  min: TypographyMinBreakpointSchema,
  max: TypographyMaxBreakpointSchema,
  /** Comma-separated step labels — e.g. "xs,s,m,l,xl,2xl,3xl,4xl". */
  steps: withFallback(Type.String(), 'xs,s,m,l,xl,2xl,3xl,4xl'),
  /** Index in the steps list whose value equals the base font size. Defaults to 2 ("m"). */
  baseScaleIndex: withFallback(Type.Number(), 2),
})

export type FrameworkTypographyGroup = Static<typeof FrameworkTypographyGroupSchema>

// ─── Spacing group ────────────────────────────────────────────────────────────

/**
 * Per-position breakpoint configs for spacing groups.
 * min.scaleRatio defaults to 1.25 (Major Third),
 * max.scaleRatio defaults to 1.414 (Augmented Fourth).
 * validate.ts: validateFrameworkSpacingGroup(), lines ~494–512.
 */
const SpacingMinBreakpointSchema = Type.Object({
  ...FrameworkSpacingBreakpointConfigSchema.properties,
  scaleRatio: withFallback(Type.Union([Type.Number(), Type.String()]), 1.25),
})

const SpacingMaxBreakpointSchema = Type.Object({
  ...FrameworkSpacingBreakpointConfigSchema.properties,
  scaleRatio: withFallback(Type.Union([Type.Number(), Type.String()]), 1.414),
})

const FrameworkSpacingGroupSchema = Type.Object({
  ...FrameworkScaleGroupBaseSchema.properties,
  /** Variable prefix — e.g. "space" produces --space-xs, --space-m, … */
  namingConvention: withFallback(Type.String(), 'space'),
  min: SpacingMinBreakpointSchema,
  max: SpacingMaxBreakpointSchema,
  /** Comma-separated step labels — defaults to 11-step scale. */
  steps: withFallback(Type.String(), '4xs,3xs,2xs,xs,s,m,l,xl,2xl,3xl,4xl'),
  /** Index in the steps list whose value equals the base size. Defaults to 5 ("m"). */
  baseScaleIndex: withFallback(Type.Number(), 5),
})

export type FrameworkSpacingGroup = Static<typeof FrameworkSpacingGroupSchema>

// ---------------------------------------------------------------------------
// Class generators — identical shape for both typography and spacing
// ---------------------------------------------------------------------------

/**
 * A class generator row in the framework Class Generator panel.
 * validate.ts: validateFrameworkClassGenerator() handles both families.
 * Typography and spacing share the exact same shape — the spacing schema
 * is an alias so consumers can import either name.
 */
const FrameworkTypographyClassGeneratorSchema = Type.Object({
  id: Type.String(),
  /** Class name pattern — `*` or `{step}` is replaced with the step suffix. */
  name: Type.String(),
  /** kebab-case CSS properties this generator targets (e.g. ['font-size']). */
  property: Type.Array(Type.String()),
  /** ID of the typography / spacing group (FrameworkTypographyGroup.id). */
  tabId: Type.String(),
  isDisabled: Type.Optional(Type.Boolean()),
})

export type FrameworkTypographyClassGenerator = Static<typeof FrameworkTypographyClassGeneratorSchema>

// Spacing class generators are identical in shape to typography class generators.
const FrameworkSpacingClassGeneratorSchema = FrameworkTypographyClassGeneratorSchema

export type FrameworkSpacingClassGenerator = FrameworkTypographyClassGenerator

// ---------------------------------------------------------------------------
// FrameworkTypographySettings and FrameworkSpacingSettings
// ---------------------------------------------------------------------------

export const TYPE_STYLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'p'] as const

export type TypeStyleTag = (typeof TYPE_STYLE_TAGS)[number]

const FrameworkTypeStyleSchema = Type.Object({
  tag: Type.Union([
    Type.Literal('h1'),
    Type.Literal('h2'),
    Type.Literal('h3'),
    Type.Literal('h4'),
    Type.Literal('h5'),
    Type.Literal('h6'),
    Type.Literal('h7'),
    Type.Literal('p'),
  ]),
  fontFamily: withFallback(Type.String(), ''),
  fontSize: withFallback(Type.String(), ''),
  fontWeight: withFallback(Type.String(), ''),
  letterSpacing: withFallback(Type.String(), ''),
  lineHeight: withFallback(Type.String(), ''),
  textTransform: withFallback(Type.String(), ''),
  maxWidth: withFallback(Type.String(), ''),
})

export type FrameworkTypeStyle = Static<typeof FrameworkTypeStyleSchema>

const FrameworkTypographySettingsSchema = Type.Object({
  groups: withFallback(Type.Array(FrameworkTypographyGroupSchema), []),
  classes: Type.Optional(Type.Array(FrameworkTypographyClassGeneratorSchema)),
  styles: withFallback(Type.Array(FrameworkTypeStyleSchema), []),
  isDisabled: Type.Optional(Type.Boolean()),
})

export type FrameworkTypographySettings = Static<typeof FrameworkTypographySettingsSchema>

const FrameworkSpacingStepSchema = Type.Union([
  Type.Literal('xs'),
  Type.Literal('s'),
  Type.Literal('m'),
  Type.Literal('l'),
  Type.Literal('xl'),
])

const FrameworkSpacingPresetsSchema = Type.Object({
  /** Inner content cap: narrow=about column, wide=product grid. */
  containerWidth: withFallback(
    Type.Union([Type.Literal('narrow'), Type.Literal('regular'), Type.Literal('wide')]),
    'wide',
  ),
  cardPadding: withFallback(
    Type.Union([Type.Literal('tight'), Type.Literal('regular'), Type.Literal('roomy')]),
    'regular',
  ),
  /** Section padding-block. */
  vertical: withFallback(FrameworkSpacingStepSchema, 'l'),
  /** Section padding-inline. */
  horizontal: withFallback(FrameworkSpacingStepSchema, 'm'),
  /**
   * Corner radius for buttons, inputs, images, articles, and divs.
   * Tailwind `rounded-*` on a selected element still wins.
   */
  radius: withFallback(
    Type.Union([
      Type.Literal('none'),
      Type.Literal('sm'),
      Type.Literal('md'),
      Type.Literal('lg'),
      Type.Literal('full'),
    ]),
    'md',
  ),
})

export type FrameworkSpacingPresets = Static<typeof FrameworkSpacingPresetsSchema>

const FrameworkSpacingSettingsSchema = Type.Object({
  groups: withFallback(Type.Array(FrameworkSpacingGroupSchema), []),
  classes: Type.Optional(Type.Array(FrameworkSpacingClassGeneratorSchema)),
  presets: Type.Optional(FrameworkSpacingPresetsSchema),
  isDisabled: Type.Optional(Type.Boolean()),
})

export type FrameworkSpacingSettings = Static<typeof FrameworkSpacingSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkIconsSettings — Relume-style site icon defaults
// ---------------------------------------------------------------------------

const IconSliderStepSchema = Type.Union([
  Type.Literal('1'),
  Type.Literal('2'),
  Type.Literal('3'),
  Type.Literal('4'),
  Type.Literal('5'),
  Type.Literal('6'),
  Type.Literal('7'),
])

export const FrameworkIconsSettingsSchema = Type.Object({
  /** Scheme role the glyph uses. */
  color: withFallback(
    Type.Union([
      Type.Literal('accent'),
      Type.Literal('heading'),
      Type.Literal('body'),
      Type.Literal('border'),
    ]),
    'accent',
  ),
  style: withFallback(Type.Union([Type.Literal('outlined'), Type.Literal('filled')]), 'outlined'),
  /** Stroke weight, 1 = hairline … 7 = bold. */
  weight: withFallback(IconSliderStepSchema, '4'),
  /** Glyph fill vs outline. */
  fill: withFallback(Type.Union([Type.Literal('outline'), Type.Literal('fill')]), 'outline'),
  /** Icon box: none, filled plate, or outlined plate. */
  treatment: withFallback(
    Type.Union([Type.Literal('none'), Type.Literal('fill'), Type.Literal('outline')]),
    'fill',
  ),
  fillIntensity: withFallback(Type.Union([Type.Literal('subtle'), Type.Literal('strong')]), 'subtle'),
  padding: withFallback(IconSliderStepSchema, '4'),
  radius: withFallback(IconSliderStepSchema, '2'),
  /** When true, the box uses site `--radius` instead of `radius`. */
  radiusLinked: withFallback(Type.Boolean(), true),
})

export type FrameworkIconsSettings = Static<typeof FrameworkIconsSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkButtonsSettings — site-wide defaults for base.button
// ---------------------------------------------------------------------------

const ButtonSliderStepSchema = Type.Union([
  Type.Literal('1'), Type.Literal('2'), Type.Literal('3'), Type.Literal('4'),
  Type.Literal('5'), Type.Literal('6'), Type.Literal('7'),
])

const ButtonColorRoleSchema = Type.Union([
  Type.Literal('accent'), Type.Literal('secondary'), Type.Literal('heading'),
  Type.Literal('body'), Type.Literal('border'),
])

const InputColorRoleSchema = Type.Union([
  Type.Literal('background'), Type.Literal('accent'), Type.Literal('secondary'),
  Type.Literal('heading'), Type.Literal('body'), Type.Literal('border'),
])

export const FrameworkButtonsSettingsSchema = Type.Object({
  primaryColor: withFallback(ButtonColorRoleSchema, 'accent'),
  secondaryColor: withFallback(ButtonColorRoleSchema, 'secondary'),
  linkColor: withFallback(ButtonColorRoleSchema, 'accent'),
  padding: withFallback(ButtonSliderStepSchema, '4'),
  radius: withFallback(ButtonSliderStepSchema, '4'),
  radiusLinked: withFallback(Type.Boolean(), true),
  /** Font token variable without the leading `--`, or `inherit`. */
  fontVariable: withFallback(Type.String(), 'inherit'),
  fontSize: withFallback(ButtonSliderStepSchema, '4'),
  fontWeight: withFallback(ButtonSliderStepSchema, '5'),
  casing: withFallback(
    Type.Union([Type.Literal('normal'), Type.Literal('capitalize'), Type.Literal('uppercase')]),
    'normal',
  ),
  letterSpacing: withFallback(ButtonSliderStepSchema, '4'),
})

export type FrameworkButtonsSettings = Static<typeof FrameworkButtonsSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkInputsSettings — site-wide defaults for form fields
// ---------------------------------------------------------------------------

export const FrameworkInputsSettingsSchema = Type.Object({
  backgroundColor: withFallback(InputColorRoleSchema, 'background'),
  textColor: withFallback(InputColorRoleSchema, 'body'),
  borderColor: withFallback(InputColorRoleSchema, 'border'),
  focusColor: withFallback(InputColorRoleSchema, 'accent'),
  padding: withFallback(ButtonSliderStepSchema, '4'),
  radius: withFallback(ButtonSliderStepSchema, '4'),
  radiusLinked: withFallback(Type.Boolean(), true),
  borderWidth: withFallback(ButtonSliderStepSchema, '2'),
  fontVariable: withFallback(Type.String(), 'inherit'),
  fontSize: withFallback(ButtonSliderStepSchema, '4'),
  fontWeight: withFallback(ButtonSliderStepSchema, '2'),
})

export type FrameworkInputsSettings = Static<typeof FrameworkInputsSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkPreferencesSettings
// ---------------------------------------------------------------------------

/**
 * Shared framework preferences applied to generated framework output.
 * Fluid-scale defaults match Core Framework: rootFontSize=10, minScreen=320,
 * maxScreen=1400, isRem=true. Generated utility tree-shaking defaults on so
 * framework.css only carries utilities assigned in the page / VC trees unless
 * the site opts into the full generated framework utility set.
 * validate.ts: validateFrameworkPreferencesSettings(), lines ~358–376.
 */
export const FrameworkPreferencesSettingsSchema = Type.Object({
  /**
   * Root font size used to convert px → rem in published CSS. Default 10 (Core
   * Framework). Constrained to `>= 1`: it is a divisor in the px→rem conversion,
   * so a value of 0 would produce `Infinity`. Rejecting it here means the
   * boundary guards division-by-zero — callers trust the parsed value.
   */
  rootFontSize: withFallback(Type.Number({ minimum: 1 }), 10),
  /** Lower clamp anchor in px for fluid scales. Default 320. */
  minScreenWidth: withFallback(Type.Number(), 320),
  /** Upper clamp anchor in px for fluid scales. Default 1400. */
  maxScreenWidth: withFallback(Type.Number(), 1400),
  /** Whether to emit clamp() values in `rem` (true) or `px` (false). */
  isRem: withFallback(Type.Boolean(), true),
  /** Whether generated framework utility CSS is tree-shaken to used class IDs. */
  treeShakeGeneratedFrameworkUtilities: withFallback(Type.Boolean(), true),
})

export type FrameworkPreferencesSettings = Static<typeof FrameworkPreferencesSettingsSchema>

// ---------------------------------------------------------------------------
// FrameworkSettings — top-level per-site framework configuration
// ---------------------------------------------------------------------------

/**
 * Structured framework token settings (colors, typography, spacing, preferences).
 * Stored under SiteSettings.framework. Absent means framework features disabled.
 *
 * validate.ts: validateFrameworkSettings(), lines ~536–544.
 * Resilient: if the outer object is invalid, the field is undefined (caller
 * uses `Type.Optional(FrameworkSettingsSchema)` when embedded in SiteSettingsSchema).
 */
export const FrameworkSettingsSchema = Type.Object({
  colors: FrameworkColorSettingsSchema,
  colorSchemes: Type.Optional(FrameworkColorSchemeSettingsSchema),
  typography: Type.Optional(FrameworkTypographySettingsSchema),
  spacing: Type.Optional(FrameworkSpacingSettingsSchema),
  icons: Type.Optional(FrameworkIconsSettingsSchema),
  buttons: Type.Optional(FrameworkButtonsSettingsSchema),
  inputs: Type.Optional(FrameworkInputsSettingsSchema),
  preferences: Type.Optional(FrameworkPreferencesSettingsSchema),
})

export type FrameworkSettings = Static<typeof FrameworkSettingsSchema>
