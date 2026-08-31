/**
 * Default type styles — H1–H7 and P.
 *
 * These paint bare semantic tags. A class, Tailwind utility, or Properties
 * override wins because the selectors use :where() (zero specificity).
 */

import type {
  FrameworkTypeStyle,
  FrameworkTypographyGroup,
  FrameworkTypographySettings,
  TypeStyleTag,
} from '@core/framework-schema'
import { TYPE_STYLE_TAGS } from '@core/framework-schema'

const FALLBACK_SIZE: Record<TypeStyleTag, string> = {
  h1: '3rem',
  h2: '2.25rem',
  h3: '1.875rem',
  h4: '1.5rem',
  h5: '1.25rem',
  h6: '1.125rem',
  h7: '1rem',
  p: '1rem',
}

const SCALE_STEP: Record<TypeStyleTag, string> = {
  h1: '4xl',
  h2: '3xl',
  h3: '2xl',
  h4: 'xl',
  h5: 'l',
  h6: 'm',
  h7: 's',
  p: 'm',
}

const DEFAULT_WEIGHT: Record<TypeStyleTag, string> = {
  h1: '700',
  h2: '700',
  h3: '600',
  h4: '600',
  h5: '600',
  h6: '600',
  h7: '600',
  p: '400',
}

const DEFAULT_LEADING: Record<TypeStyleTag, string> = {
  h1: '1.15',
  h2: '1.2',
  h3: '1.25',
  h4: '1.3',
  h5: '1.35',
  h6: '1.4',
  h7: '1.4',
  p: '1.6',
}

const DEFAULT_TRACKING: Record<TypeStyleTag, string> = {
  h1: '-0.02em',
  h2: '-0.02em',
  h3: '-0.015em',
  h4: '-0.01em',
  h5: '0',
  h6: '0',
  h7: '0.02em',
  p: '0',
}

const STYLE_PROPS: Array<{ key: keyof FrameworkTypeStyle; css: string }> = [
  { key: 'fontFamily', css: 'font-family' },
  { key: 'fontSize', css: 'font-size' },
  { key: 'fontWeight', css: 'font-weight' },
  { key: 'letterSpacing', css: 'letter-spacing' },
  { key: 'lineHeight', css: 'line-height' },
  { key: 'textTransform', css: 'text-transform' },
]

export function defaultTypeStyle(
  tag: TypeStyleTag,
  groups: readonly FrameworkTypographyGroup[] = [],
): FrameworkTypeStyle {
  return {
    tag,
    fontFamily: 'var(--font-primary)',
    fontSize: typeStyleFontSize(tag, groups),
    fontWeight: DEFAULT_WEIGHT[tag],
    letterSpacing: DEFAULT_TRACKING[tag],
    lineHeight: DEFAULT_LEADING[tag],
    textTransform: 'none',
    maxWidth: '',
  }
}

export function resolveTypeStyles(
  settings: FrameworkTypographySettings | null | undefined,
): FrameworkTypeStyle[] {
  const stored = settings?.styles ?? []
  const byTag = new Map(stored.map((row) => [row.tag, row]))
  const groups = settings?.groups ?? []
  return TYPE_STYLE_TAGS.map((tag) => {
    const fallback = defaultTypeStyle(tag, groups)
    const row = byTag.get(tag)
    if (!row) return fallback
    return {
      tag,
      fontFamily: row.fontFamily || fallback.fontFamily,
      fontSize: row.fontSize || fallback.fontSize,
      fontWeight: row.fontWeight || fallback.fontWeight,
      letterSpacing: row.letterSpacing || fallback.letterSpacing,
      lineHeight: row.lineHeight || fallback.lineHeight,
      textTransform: row.textTransform || fallback.textTransform,
      maxWidth: row.maxWidth ?? '',
    }
  })
}

export function generateTypeStyleCss(
  settings: FrameworkTypographySettings | null | undefined,
): string {
  if (!settings || settings.isDisabled) return ''
  const blocks = resolveTypeStyles(settings).flatMap((style) => {
    const decls = STYLE_PROPS.flatMap(({ key, css }) => {
      if (key === 'tag') return []
      const value = safeCssValue(String(style[key] ?? ''))
      return value ? [`  ${css}: ${value};`] : []
    })
    if (decls.length === 0) return []
    return [`:where(${style.tag}) {\n${decls.join('\n')}\n}`]
  })
  return blocks.join('\n\n')
}

function typeStyleFontSize(
  tag: TypeStyleTag,
  groups: readonly FrameworkTypographyGroup[],
): string {
  const group = groups[0]
  if (!group) return FALLBACK_SIZE[tag]
  const steps = new Set(group.steps.split(',').map((step) => step.trim()).filter(Boolean))
  const step = SCALE_STEP[tag]
  if (!steps.has(step)) return FALLBACK_SIZE[tag]
  const prefix = group.namingConvention.trim() || 'text'
  return `var(--${prefix}-${step}, ${FALLBACK_SIZE[tag]})`
}

function safeCssValue(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (/[;{}]/.test(text) || /<\//.test(text)) return null
  return text
}
