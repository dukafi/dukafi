/**
 * H1–H7 and P defaults. These style bare tags; a class or Tailwind utility
 * on the selected element still wins.
 */
import { useState, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import { TYPE_STYLE_TAGS, type TypeStyleTag } from '@core/framework-schema'
import { resolveTypeStyles } from '@core/framework'
import {
  fontTokenCssVariable,
  fontTokenValueExpr,
  resolveFontTokenStack,
  sortFontTokens,
  type FontToken,
  type SiteFontsSettings,
} from '@core/fonts'
import { FilterBar, type FilterBarItem } from '@ui/components/FilterBar'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import styles from './TypeStylesSection.module.css'

const EMPTY_TOKENS: readonly FontToken[] = []

function resolvePreviewFontFamily(
  fontFamily: string,
  fonts: SiteFontsSettings | null | undefined,
): string | undefined {
  if (!fontFamily || fontFamily === 'inherit') return undefined
  const token = fonts?.tokens?.find((row) => fontTokenValueExpr(row.variable) === fontFamily)
  if (token) return resolveFontTokenStack(token, fonts)
  if (fontFamily === 'var(--font-primary)') {
    const primary = fonts?.tokens?.find((row) => fontTokenCssVariable(row.variable) === '--font-primary')
    if (primary) return resolveFontTokenStack(primary, fonts)
    const first = fonts?.items?.[0]
    if (first) return `"${first.family}", sans-serif`
  }
  return fontFamily
}

const CASE_OPTIONS = [
  { value: 'none', label: 'As typed' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
]

const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' },
]

const PREVIEW = 'The quick brown fox jumps over the lazy dog'

const FONT_SIZE = { min: 0.75, max: 6, step: 0.125, fallback: 1 }
const LETTER_SPACING = { min: -0.08, max: 0.16, step: 0.005, fallback: 0 }
const LINE_HEIGHT = { min: 0.9, max: 2.2, step: 0.05, fallback: 1.4 }

function parseCssNumber(value: string, fallback: number): number {
  const matches = value.match(/-?\d+(?:\.\d+)?/g)
  if (!matches?.length) return fallback
  const n = Number(matches[matches.length - 1])
  return Number.isFinite(n) ? n : fallback
}

function formatNumber(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)))
}

function TypeStyleSlider({
  label,
  ariaLabel,
  value,
  fallback,
  min,
  max,
  step,
  unit,
  toCss,
  onChange,
}: {
  label: string
  ariaLabel: string
  value: string
  fallback: number
  min: number
  max: number
  step: number
  unit: string
  toCss: (n: number) => string
  onChange: (css: string) => void
}) {
  const numeric = parseCssNumber(value, fallback)
  const [draft, setDraft] = useState<string | null>(null)
  const progress = `${((Math.min(max, Math.max(min, numeric)) - min) / (max - min)) * 100}%`

  function commitNumber(raw: string) {
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChange(toCss(next))
  }

  function stopPanelDrag(event: { stopPropagation: () => void }) {
    event.stopPropagation()
  }

  return (
    <div className={styles.sliderField}>
      <div className={styles.sliderHeader}>
        <span>{label}</span>
        <Input
          type="text"
          inputMode="decimal"
          fieldSize="xs"
          numberSpinner={false}
          unit={unit || undefined}
          className={styles.sliderValue}
          value={draft ?? formatNumber(numeric)}
          aria-label={`${ariaLabel} value`}
          onPointerDown={stopPanelDrag}
          onFocus={() => setDraft(formatNumber(numeric))}
          onChange={(event) => {
            const raw = event.currentTarget.value
            setDraft(raw)
            if (raw.trim() !== '' && raw !== '-' && raw !== '.') commitNumber(raw)
          }}
          onBlur={() => {
            if (draft != null) commitNumber(draft)
            setDraft(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>
      <input
        type="range"
        className={styles.slider}
        style={{ '--slider-progress': progress } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={numeric}
        aria-label={ariaLabel}
        onPointerDown={stopPanelDrag}
        onMouseDown={stopPanelDrag}
        onInput={(event) => onChange(toCss(Number(event.currentTarget.value)))}
      />
    </div>
  )
}

export function TypeStylesSection() {
  const typography = useEditorStore((s) => s.site?.settings.framework?.typography)
  const fonts = useEditorStore((s) => s.site?.settings.fonts ?? null)
  const tokens = fonts?.tokens ?? EMPTY_TOKENS
  const updateFrameworkTypeStyle = useEditorStore((s) => s.updateFrameworkTypeStyle)
  const [tag, setTag] = useState<TypeStyleTag>('h1')
  const stylesForSite = resolveTypeStyles(typography)
  const current = stylesForSite.find((row) => row.tag === tag) ?? stylesForSite[0]!

  const tokenOptions = sortFontTokens([...tokens]).map((token) => ({
    value: fontTokenValueExpr(token.variable),
    label: token.name,
  }))
  const fontOptions = [
    ...(tokenOptions.some((option) => option.value === 'var(--font-primary)')
      ? []
      : [{ value: 'var(--font-primary)', label: 'Primary' }]),
    ...tokenOptions,
    { value: 'inherit', label: 'Inherit' },
  ]

  const previewStyle = {
    fontFamily: resolvePreviewFontFamily(current.fontFamily, fonts),
    fontSize: current.fontSize || undefined,
    fontWeight: current.fontWeight || undefined,
    letterSpacing: current.letterSpacing || undefined,
    lineHeight: current.lineHeight || undefined,
    textTransform: (current.textTransform || undefined) as CSSProperties['textTransform'],
  }

  return (
    <div className={styles.root} data-testid="type-styles">
      <p className={styles.hint}>
        Default look for each tag. Properties or Tailwind on a selected element override it.
      </p>
      <FilterBar<TypeStyleTag>
        className={styles.tags}
        items={TYPE_STYLE_TAGS.map<FilterBarItem<TypeStyleTag>>((value) => ({
          value,
          label: value === 'p' ? 'P' : value.toUpperCase(),
        }))}
        value={tag}
        onValueChange={setTag}
        groupLabel="Type styles"
      />
      <div className={styles.preview} style={previewStyle}>
        {PREVIEW}
      </div>
      <label className={styles.field}>
        <span>Font</span>
        <Select
          fieldSize="sm"
          value={current.fontFamily}
          options={fontOptions}
          aria-label="Type style font"
          onChange={(event) => updateFrameworkTypeStyle(tag, { fontFamily: event.currentTarget.value })}
        />
      </label>
      <label className={styles.field}>
        <span>Font weight</span>
        <Select
          fieldSize="sm"
          value={current.fontWeight}
          options={WEIGHT_OPTIONS}
          aria-label="Type style font weight"
          onChange={(event) => updateFrameworkTypeStyle(tag, { fontWeight: event.currentTarget.value })}
        />
      </label>
      <label className={styles.field}>
        <span>Case</span>
        <Select
          fieldSize="sm"
          value={current.textTransform || 'none'}
          options={CASE_OPTIONS}
          aria-label="Type style case"
          onChange={(event) => updateFrameworkTypeStyle(tag, { textTransform: event.currentTarget.value })}
        />
      </label>
      <TypeStyleSlider
        label="Font size"
        ariaLabel="Type style font size"
        value={current.fontSize}
        fallback={FONT_SIZE.fallback}
        min={FONT_SIZE.min}
        max={FONT_SIZE.max}
        step={FONT_SIZE.step}
        unit="rem"
        toCss={(n) => `${formatNumber(n)}rem`}
        onChange={(fontSize) => updateFrameworkTypeStyle(tag, { fontSize })}
      />
      <TypeStyleSlider
        label="Letter spacing"
        ariaLabel="Type style letter spacing"
        value={current.letterSpacing}
        fallback={LETTER_SPACING.fallback}
        min={LETTER_SPACING.min}
        max={LETTER_SPACING.max}
        step={LETTER_SPACING.step}
        unit="em"
        toCss={(n) => (n === 0 ? '0' : `${formatNumber(n)}em`)}
        onChange={(letterSpacing) => updateFrameworkTypeStyle(tag, { letterSpacing })}
      />
      <TypeStyleSlider
        label="Line height"
        ariaLabel="Type style line height"
        value={current.lineHeight}
        fallback={LINE_HEIGHT.fallback}
        min={LINE_HEIGHT.min}
        max={LINE_HEIGHT.max}
        step={LINE_HEIGHT.step}
        unit=""
        toCss={(n) => formatNumber(n)}
        onChange={(lineHeight) => updateFrameworkTypeStyle(tag, { lineHeight })}
      />
    </div>
  )
}
