/**
 * Color schemes — Relume-style combinations applied to a section.
 *
 * Palette tokens stay the source of hex. A scheme is six roles pointing at
 * those slugs. Putting `scheme-2` on a section remaps `--scheme-*` for
 * everything inside it; children use `bg-scheme-background` /
 * `text-scheme-heading` rather than a raw token.
 *
 * Heading / body are tuned for the canvas. On Accent or Secondary fills, use
 * `text-scheme-on-accent` / `text-scheme-on-secondary` — those pick Heading,
 * Background, or Body (whichever contrasts) at generate time.
 */

import type { StyleRule } from '@core/page-tree'
import { classKindSelector } from '@core/page-tree'
import type {
  ColorSchemeRole,
  FrameworkColorScheme,
  FrameworkColorSchemeRoles,
  FrameworkColorSchemeSettings,
  FrameworkColorSettings,
  FrameworkColorToken,
  FrameworkColorUtilityType,
} from '@core/framework-schema'
import { COLOR_SCHEME_ROLES } from '@core/framework-schema'
import {
  mixFrameworkColor,
  normalizeFrameworkColorSlug,
  generateFrameworkColorVariableSets,
  frameworkColorContrast,
} from './colors'

export const SCHEME_ROLE_VARS: Record<ColorSchemeRole, string> = {
  background: '--scheme-background',
  secondary: '--scheme-secondary',
  heading: '--scheme-heading',
  body: '--scheme-body',
  accent: '--scheme-accent',
  border: '--scheme-border',
}

export const SCHEME_ON_ACCENT_VAR = '--scheme-on-accent'
export const SCHEME_ON_SECONDARY_VAR = '--scheme-on-secondary'

const ROLE_UTILITIES: ReadonlyArray<{
  role: ColorSchemeRole
  utility: FrameworkColorUtilityType
  name: string
}> = [
  { role: 'background', utility: 'background', name: 'bg-scheme-background' },
  { role: 'secondary', utility: 'background', name: 'bg-scheme-secondary' },
  { role: 'heading', utility: 'text', name: 'text-scheme-heading' },
  { role: 'body', utility: 'text', name: 'text-scheme-body' },
  { role: 'accent', utility: 'text', name: 'text-scheme-accent' },
  { role: 'accent', utility: 'background', name: 'bg-scheme-accent' },
  { role: 'border', utility: 'border', name: 'border-scheme-border' },
]

const ON_FILL_UTILITIES: ReadonlyArray<{
  variable: string
  name: string
  tokenName: string
}> = [
  { variable: SCHEME_ON_ACCENT_VAR, name: 'text-scheme-on-accent', tokenName: 'on-accent' },
  { variable: SCHEME_ON_SECONDARY_VAR, name: 'text-scheme-on-secondary', tokenName: 'on-secondary' },
]

export function schemeClassName(slug: string): string {
  return `scheme-${normalizeFrameworkColorSlug(slug).replace(/^scheme-/, '')}`
}

export function schemeClassId(schemeId: string): string {
  return `framework:scheme:scope:${schemeId}`
}

export function schemeRoleClassId(name: string): string {
  return `framework:scheme:role:${name}`
}

export function isSchemeClassName(name: string): boolean {
  return /^scheme-[a-z0-9-]+$/.test(name)
}

/** Scope or role class that assigns a scheme — not a style-edit target. */
export function isSchemeAssignmentClass(cls: StyleRule | null | undefined): boolean {
  if (!cls) return false
  if (cls.generated?.family === 'scheme') return true
  return isSchemeClassName(cls.name)
}

export interface DerivedSchemeColors {
  prefix: string
  tokens: Array<{ slug: string; lightValue: string; role: ColorSchemeRole }>
  roles: FrameworkColorSchemeRoles
}

/** Build a six-role scheme from one seed color. The seed becomes Accent. */
export function deriveSchemeFromColor(
  seed: string,
  prefix: string,
): DerivedSchemeColors | null {
  const accent = mixFrameworkColor(seed, {}) ?? seed.trim()
  if (!accent) return null
  const background = mixFrameworkColor(seed, { l: 96, s: 18 }) ?? 'hsla(0, 0%, 98%, 1)'
  const secondary = mixFrameworkColor(seed, { l: 92, s: 16 }) ?? 'hsla(0, 0%, 94%, 1)'
  const heading = mixFrameworkColor(seed, { l: 10, s: 18 }) ?? 'hsla(0, 0%, 8%, 1)'
  const body = mixFrameworkColor(seed, { l: 24, s: 12 }) ?? 'hsla(0, 0%, 24%, 1)'
  const border = mixFrameworkColor(seed, { l: 18, s: 10, a: 0.22 }) ?? 'hsla(0, 0%, 20%, 0.22)'
  const slug = normalizeFrameworkColorSlug(prefix)
  const tokens: DerivedSchemeColors['tokens'] = [
    { slug: `${slug}-background`, lightValue: background, role: 'background' },
    { slug: `${slug}-secondary`, lightValue: secondary, role: 'secondary' },
    { slug: `${slug}-heading`, lightValue: heading, role: 'heading' },
    { slug: `${slug}-body`, lightValue: body, role: 'body' },
    { slug: `${slug}-accent`, lightValue: accent, role: 'accent' },
    { slug: `${slug}-border`, lightValue: border, role: 'border' },
  ]
  return {
    prefix: slug,
    tokens,
    roles: {
      background: tokens[0]!.slug,
      secondary: tokens[1]!.slug,
      heading: tokens[2]!.slug,
      body: tokens[3]!.slug,
      accent: tokens[4]!.slug,
      border: tokens[5]!.slug,
    },
  }
}

export interface SchemePaletteOption {
  slug: string
  label: string
  group: string
  swatch: string
  textValue: string
}

export function humanizeColorSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

export function resolveSchemeRoleColor(
  tokens: readonly FrameworkColorToken[],
  slug: string,
): string {
  const name = `--${normalizeFrameworkColorSlug(slug)}`
  const match = generateFrameworkColorVariableSets({ tokens }).light.find((variable) => variable.name === name)
  if (match) return match.value
  return tokens.find((token) => normalizeFrameworkColorSlug(token.slug) === normalizeFrameworkColorSlug(slug))
    ?.lightValue || '#888888'
}

/** Brand colors and their generated shades, grouped for the scheme role picker. */
export function listSchemePaletteOptions(
  tokens: readonly FrameworkColorToken[],
): SchemePaletteOption[] {
  const byId = new Map(tokens.map((token) => [token.id, token]))
  const options: SchemePaletteOption[] = []
  for (const variable of generateFrameworkColorVariableSets({ tokens }).light) {
    const token = byId.get(variable.tokenId)
    const brand = humanizeColorSlug(variable.slug)
    const group = token?.category.trim() || 'Colors'
    const label = schemePaletteLabel(brand, variable.variantId, variable.variantName)
    options.push({
      slug: variable.name.replace(/^--/, ''),
      label,
      group,
      swatch: variable.value,
      textValue: `${group} ${label}`,
    })
  }
  return options
}

function schemePaletteLabel(
  brand: string,
  variantId: string,
  variantName: string | undefined,
): string {
  if (!variantName) return brand
  if (variantId.startsWith('transparent-')) return `${brand} - ${variantName}%`
  return `${brand} - ${variantName}`
}

export function pickTokenSlug(
  tokens: readonly FrameworkColorToken[],
  ...candidates: string[]
): string {
  const slugs = new Set(tokens.map((token) => normalizeFrameworkColorSlug(token.slug)))
  for (const candidate of candidates) {
    const slug = normalizeFrameworkColorSlug(candidate)
    if (slugs.has(slug)) return slug
  }
  return tokens[0] ? normalizeFrameworkColorSlug(tokens[0].slug) : 'primary'
}

export function defaultColorSchemeRoles(
  tokens: readonly FrameworkColorToken[],
): FrameworkColorSchemeRoles {
  return {
    background: pickTokenSlug(tokens, 'bg-body', 'bg-surface', 'light'),
    secondary: pickTokenSlug(tokens, 'bg-surface', 'bg-body', 'light'),
    heading: pickTokenSlug(tokens, 'text-title', 'text-body', 'dark'),
    body: pickTokenSlug(tokens, 'text-body', 'text-title', 'dark'),
    accent: pickTokenSlug(tokens, 'primary', 'secondary', 'tertiary'),
    border: pickTokenSlug(tokens, 'border-primary', 'dark', 'primary'),
  }
}

export function buildDefaultColorSchemes(
  tokens: readonly FrameworkColorToken[],
): FrameworkColorScheme[] {
  const canvas = defaultColorSchemeRoles(tokens)
  const surface: FrameworkColorSchemeRoles = {
    ...canvas,
    background: pickTokenSlug(tokens, 'bg-surface', 'light', canvas.background),
    secondary: pickTokenSlug(tokens, 'bg-body', canvas.secondary),
  }
  const ink: FrameworkColorSchemeRoles = {
    background: pickTokenSlug(tokens, 'dark', canvas.heading),
    secondary: pickTokenSlug(tokens, 'bg-body', canvas.background),
    heading: pickTokenSlug(tokens, 'light', 'text-title'),
    body: pickTokenSlug(tokens, 'light', 'text-body'),
    accent: canvas.accent,
    border: pickTokenSlug(tokens, 'light', canvas.border),
  }
  const brand: FrameworkColorSchemeRoles = {
    background: canvas.accent,
    secondary: pickTokenSlug(tokens, 'primary', canvas.accent),
    heading: pickTokenSlug(tokens, 'light', canvas.heading),
    body: pickTokenSlug(tokens, 'light', canvas.body),
    accent: pickTokenSlug(tokens, 'dark', canvas.heading),
    border: pickTokenSlug(tokens, 'light', canvas.border),
  }

  return [
    { id: 'scheme-1', slug: 'scheme-1', name: 'Scheme 1', order: 0, roles: canvas },
    { id: 'scheme-2', slug: 'scheme-2', name: 'Scheme 2', order: 1, roles: surface },
    { id: 'scheme-3', slug: 'scheme-3', name: 'Scheme 3', order: 2, roles: ink },
    { id: 'scheme-4', slug: 'scheme-4', name: 'Scheme 4', order: 3, roles: brand },
  ]
}

export function resolveColorSchemes(
  settings: FrameworkColorSchemeSettings | null | undefined,
  tokens: readonly FrameworkColorToken[] = [],
): FrameworkColorScheme[] {
  const schemes = settings?.schemes ?? []
  if (schemes.length > 0) {
    return [...schemes].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
  }
  return tokens.length > 0 ? buildDefaultColorSchemes(tokens) : []
}

export function generateColorSchemeClasses(
  schemeSettings: FrameworkColorSchemeSettings | null | undefined,
  colorSettings: FrameworkColorSettings | null | undefined,
): Record<string, StyleRule> {
  const tokens = colorSettings?.tokens ?? []
  const schemes = resolveColorSchemes(schemeSettings, tokens)
  const classes: Record<string, StyleRule> = {}
  const now = Date.now()

  for (const scheme of schemes) {
    const name = schemeClassName(scheme.slug)
    const id = schemeClassId(scheme.id)
    classes[id] = {
      id,
      name,
      kind: 'class',
      selector: `${classKindSelector(name)}, [data-scheme="${name}"]`,
      order: 0,
      styles: schemeScopeStyles(scheme.roles, tokens),
      contextStyles: {},
      generated: {
        origin: 'framework',
        family: 'scheme',
        sourceId: scheme.id,
        tokenName: name,
        locked: true,
      },
      tags: ['framework', 'scheme'],
      createdAt: now,
      updatedAt: now,
    }
  }

  if (schemes.length === 0) return classes

  for (const row of ROLE_UTILITIES) {
    const id = schemeRoleClassId(row.name)
    const variableRef = `var(${SCHEME_ROLE_VARS[row.role]})`
    classes[id] = {
      id,
      name: row.name,
      kind: 'class',
      selector: classKindSelector(row.name),
      order: 0,
      styles: utilityStyles(row.utility, variableRef),
      contextStyles: {},
      generated: {
        origin: 'framework',
        family: 'scheme',
        sourceId: 'roles',
        tokenName: row.role,
        locked: true,
      },
      tags: ['framework', 'scheme', 'utility'],
      createdAt: now,
      updatedAt: now,
    }
  }

  for (const row of ON_FILL_UTILITIES) {
    const id = schemeRoleClassId(row.name)
    classes[id] = {
      id,
      name: row.name,
      kind: 'class',
      selector: classKindSelector(row.name),
      order: 0,
      styles: { color: `var(${row.variable})` },
      contextStyles: {},
      generated: {
        origin: 'framework',
        family: 'scheme',
        sourceId: 'roles',
        tokenName: row.tokenName,
        locked: true,
      },
      tags: ['framework', 'scheme', 'utility'],
      createdAt: now,
      updatedAt: now,
    }
  }

  return classes
}

const MIN_ON_FILL_CONTRAST = 4.5

/** Heading, Background, or Body — whichever reads on this fill. */
export function pickSchemeOnFillSlug(
  fillSlug: string,
  roles: FrameworkColorSchemeRoles,
  tokens: readonly FrameworkColorToken[],
): string {
  const fill = resolveSchemeRoleColor(tokens, fillSlug)
  const fillName = normalizeFrameworkColorSlug(fillSlug)
  const fromScheme = pickHighestContrast(fill, fillName, [roles.heading, roles.background, roles.body], tokens)
  if (fromScheme && fromScheme.ratio >= MIN_ON_FILL_CONTRAST) return fromScheme.slug
  const fallback = pickHighestContrast(fill, fillName, ['light', 'dark'], tokens)
  if (fallback && fallback.ratio > (fromScheme?.ratio ?? -1)) return fallback.slug
  return fromScheme?.slug || normalizeFrameworkColorSlug(roles.heading || roles.background || fillSlug)
}

function pickHighestContrast(
  fill: string,
  fillSlug: string,
  candidates: readonly string[],
  tokens: readonly FrameworkColorToken[],
): { slug: string; ratio: number } | null {
  let best: { slug: string; ratio: number } | null = null
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const slug = normalizeFrameworkColorSlug(candidate || '')
    if (!slug || slug === fillSlug || seen.has(slug)) continue
    seen.add(slug)
    const ratio = frameworkColorContrast(fill, resolveSchemeRoleColor(tokens, slug))
    if (ratio == null || (best && ratio <= best.ratio)) continue
    best = { slug, ratio }
  }
  return best
}

function schemeScopeStyles(
  roles: FrameworkColorSchemeRoles,
  tokens: readonly FrameworkColorToken[],
): Record<string, string> {
  const styles: Record<string, string> = {}
  for (const role of COLOR_SCHEME_ROLES) {
    const slug = normalizeFrameworkColorSlug(roles[role] || '')
    if (!slug) continue
    styles[SCHEME_ROLE_VARS[role]] = `var(--${slug})`
  }
  const onAccent = pickSchemeOnFillSlug(roles.accent, roles, tokens)
  const onSecondary = pickSchemeOnFillSlug(roles.secondary, roles, tokens)
  if (onAccent) styles[SCHEME_ON_ACCENT_VAR] = `var(--${onAccent})`
  if (onSecondary) styles[SCHEME_ON_SECONDARY_VAR] = `var(--${onSecondary})`
  return styles
}

function utilityStyles(
  utility: FrameworkColorUtilityType,
  value: string,
): Partial<CSSPropertyBag> {
  switch (utility) {
    case 'text':
      return { color: value }
    case 'background':
      return { backgroundColor: value }
    case 'border':
      return { borderColor: value }
    case 'fill':
      return { fill: value }
  }
}
