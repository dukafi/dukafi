/**
 * BorderControl — visual per-side border editor + radius corner editor.
 *
 * Replaces the old stack of free-text shorthand rows (border / borderTop /
 * borderRight / … / borderRadius / outline) with a task-shaped widget that
 * mirrors how SpacingBoxControl handles padding & margin:
 *
 *   ┌─ Border ───────────────────────────────┐
 *   │  [⛓]   ┌───────┐    Width  [ 1px    ]   │
 *   │        │ ┌───┐ │    Style  [ solid ▾]   │
 *   │        │ │   │ │    Color  [ ■ #ccc ]   │
 *   │        │ └───┘ │                        │
 *   │        └───────┘                        │
 *   └─────────────────────────────────────────┘
 *
 * Storage model — the per-side longhands are the canonical shape:
 *   borderTopWidth / borderTopStyle / borderTopColor (× right / bottom / left)
 *   borderTopLeftRadius / …RightRadius / …BottomRightRadius / …BottomLeftRadius
 *
 * The CSS shorthands (`border`, `borderTop`, …, `borderRadius`) are no longer
 * the control's source of truth — they live in an "Advanced" disclosure for
 * power users who want to paste a raw shorthand string. The publisher emits the
 * longhands directly (they're in ALLOWED_PROPS); collapsing all-equal sides to
 * the `border:` shorthand at emit time is a follow-up cosmetic optimisation.
 *
 * Link/sync semantics match SpacingBoxControl: when "linked", a write applies
 * to all four sides (or corners); when unlinked, the user picks an active side
 * via the visual box and edits it alone. The control auto-relinks when external
 * changes bring all sides back to a uniform value (React-19 render-time idiom,
 * no effect).
 */

import { useEffect, useState } from 'react'
import type { CSSPropertyBag } from '@core/page-tree'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { ColorValueInput } from '@site/property-controls/ColorValueInput'
import { useEditorPreference } from '@site/preferences/editorPreferences'
import { LinkIcon } from 'pixel-art-icons/icons/link'
import { CloseIcon } from 'pixel-art-icons/icons/close'
import { cn } from '@ui/cn'
import { getEnumOptions } from '../cssControlTypes'
import styles from './BorderControl.module.css'

// ---------------------------------------------------------------------------
// Types + key helpers
// ---------------------------------------------------------------------------

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const
type Side = (typeof SIDES)[number]

const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const
type Corner = (typeof CORNERS)[number]

type BorderField = 'Width' | 'Style' | 'Color'

function borderKey(side: Side, field: BorderField): keyof CSSPropertyBag {
  return `border${side}${field}` as keyof CSSPropertyBag
}

function radiusKey(corner: Corner): keyof CSSPropertyBag {
  return `border${corner}Radius` as keyof CSSPropertyBag
}

interface BorderControlProps {
  storedStyles: Record<string, unknown>
  currentStyles: Record<string, unknown>
  onChange: (property: keyof CSSPropertyBag, value: string | number | undefined) => void
  /**
   * Fully clear a property across base + all breakpoints. Border edits use
   * this (not the lighter `onRemove`) so a "Clear border" affordance really
   * removes the longhands everywhere, matching the LayoutSection / Position
   * clear semantics.
   */
  onClearProperty: (property: keyof CSSPropertyBag) => void
  /**
   * Patch-shaped hover-preview channel (see StyleRuleComposer.handlePreview).
   * Forwarded to the border-style select and border-colour field so hovering
   * a suggestion previews on the canvas; honours the current link state so a
   * linked border previews all four sides at once.
   */
  onPreview?: (patch: Partial<CSSPropertyBag>) => void
  onClearPreview?: () => void
}

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

function pickString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return `${value}px`
  return ''
}

/** Read every side's value for one field; report whether all four match. */
function readSideField(
  styles: Record<string, unknown>,
  field: BorderField,
): { perSide: Record<Side, string>; uniform: boolean; anySet: boolean } {
  const perSide = {} as Record<Side, string>
  for (const side of SIDES) perSide[side] = pickString(styles[borderKey(side, field)])
  const values = SIDES.map((s) => perSide[s])
  const anySet = values.some((v) => v !== '')
  const uniform = anySet && values.every((v) => v === values[0])
  return { perSide, uniform, anySet }
}

function readCorners(styles: Record<string, unknown>): {
  perCorner: Record<Corner, string>
  uniform: boolean
  anySet: boolean
} {
  const perCorner = {} as Record<Corner, string>
  for (const corner of CORNERS) perCorner[corner] = pickString(styles[radiusKey(corner)])
  const values = CORNERS.map((c) => perCorner[c])
  const anySet = values.some((v) => v !== '')
  const uniform = anySet && values.every((v) => v === values[0])
  return { perCorner, uniform, anySet }
}

// ---------------------------------------------------------------------------
// BorderControl
// ---------------------------------------------------------------------------

export function BorderControl({
  storedStyles,
  currentStyles,
  onChange,
  onClearProperty,
  onPreview,
  onClearPreview,
}: BorderControlProps) {
  // Hover previews are gated by the shared "Preview suggestions on hover"
  // preference. The border-colour field self-gates (ColorValueInput reads the
  // pref); the raw style <Select> below is gated here.
  const hoverPreviewEnabled = useEditorPreference('hoverPreview')

  useEffect(() => {
    if (!hoverPreviewEnabled) onClearPreview?.()
  }, [hoverPreviewEnabled, onClearPreview])
  // ── Border (per-side) state ──────────────────────────────────────────────
  const widthState = readSideField(storedStyles, 'Width')
  const styleState = readSideField(storedStyles, 'Style')
  const colorState = readSideField(storedStyles, 'Color')

  const widthFallback = readSideField(currentStyles, 'Width')

  // All three fields uniform across all sides → the border is "linked".
  const borderUniform = widthState.uniform && styleState.uniform && colorState.uniform
  const borderAnySet = widthState.anySet || styleState.anySet || colorState.anySet

  const [borderLinked, setBorderLinked] = useState<boolean>(() => borderUniform || !borderAnySet)
  // Auto-relink (never auto-unlink — splitting is a deliberate user action).
  if (!borderLinked && borderUniform) setBorderLinked(true)

  const [activeSide, setActiveSide] = useState<Side>('Top')

  // The side whose values populate the inputs: 'Top' when linked, else the
  // user-selected side.
  const editSide: Side = borderLinked ? 'Top' : activeSide

  const writeSide = (field: BorderField, value: string | number | undefined) => {
    const sides: Side[] = borderLinked ? [...SIDES] : [editSide]
    for (const s of sides) onChange(borderKey(s, field), value)
  }

  // Transient preview counterpart to writeSide — builds a patch across the
  // same set of sides (all four when linked) and routes it through the
  // hover-preview channel without committing. Gated by the preference.
  const previewSide =
    hoverPreviewEnabled && onPreview
      ? (field: BorderField, value: string | number | undefined) => {
          const sides: Side[] = borderLinked ? [...SIDES] : [editSide]
          const patch: Partial<CSSPropertyBag> = {}
          for (const s of sides) {
            ;(patch as Record<string, unknown>)[borderKey(s, field)] = value ?? null
          }
          onPreview(patch)
        }
      : undefined

  const clearBorder = () => {
    for (const side of SIDES) {
      for (const field of ['Width', 'Style', 'Color'] as BorderField[]) {
        onClearProperty(borderKey(side, field))
      }
    }
  }

  const widthValue = widthState.perSide[editSide]
  const styleValue = styleState.perSide[editSide]
  const colorValue = colorState.perSide[editSide]

  const styleOptions = getEnumOptions('borderTopStyle') ?? []

  // ── Radius (per-corner) state ────────────────────────────────────────────
  const radiusState = readCorners(storedStyles)
  const radiusFallback = readCorners(currentStyles)
  const [radiusLinked, setRadiusLinked] = useState<boolean>(
    () => radiusState.uniform || !radiusState.anySet,
  )
  if (!radiusLinked && radiusState.uniform) setRadiusLinked(true)
  const [activeCorner, setActiveCorner] = useState<Corner>('TopLeft')
  const editCorner: Corner = radiusLinked ? 'TopLeft' : activeCorner

  const writeRadius = (value: string | number | undefined) => {
    const corners: Corner[] = radiusLinked ? [...CORNERS] : [editCorner]
    for (const c of corners) onChange(radiusKey(c), value)
  }

  const clearRadius = () => {
    for (const corner of CORNERS) onClearProperty(radiusKey(corner))
  }

  const radiusValue = radiusState.perCorner[editCorner]
  const radiusPlaceholder = radiusFallback.perCorner[editCorner] || '0px'
  const widthPlaceholder = widthFallback.perSide[editSide] || '0px'

  return (
    <div className={styles.root}>
      {/* ── Border ──────────────────────────────────────────────────────── */}
      <div className={styles.group}>
        <div className={styles.groupHeader}>
          <span className={styles.groupTitle}>Sides</span>
          <div className={styles.groupActions}>
            <Button
              variant="ghost"
              size="micro"
              iconOnly
              active={borderLinked}
              aria-label={borderLinked ? 'Unlink sides' : 'Link all sides'}
              tooltip={borderLinked ? 'Editing all sides' : 'Editing one side'}
              onClick={() => setBorderLinked((v) => !v)}
            >
              <LinkIcon size={14} aria-hidden="true" />
            </Button>
            {borderAnySet && (
              <Button
                variant="ghost"
                size="micro"
                iconOnly
                aria-label="Clear border"
                tooltip="Clear border"
                onClick={clearBorder}
              >
                <CloseIcon size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <div className={styles.borderBody}>
          <SidePicker
            linked={borderLinked}
            activeSide={activeSide}
            setSides={widthState.perSide}
            onSelectSide={(side) => {
              setBorderLinked(false)
              setActiveSide(side)
            }}
          />

          <div className={styles.fields}>
            <FieldRow label="Width">
              <Input
                fieldSize="sm"
                value={widthValue}
                placeholder={widthPlaceholder}
                aria-label={`Border ${borderLinked ? 'all sides' : editSide.toLowerCase()} width`}
                onChange={(e) => writeSide('Width', e.target.value || undefined)}
              />
            </FieldRow>

            <FieldRow label="Style">
              <Select
                fieldSize="sm"
                value={styleValue}
                aria-label={`Border ${borderLinked ? 'all sides' : editSide.toLowerCase()} style`}
                onChange={(e) => writeSide('Style', e.target.value || undefined)}
                options={[
                  { label: '—', value: '' },
                  ...styleOptions.map((o) => ({ label: o, value: o })),
                ]}
                onOptionPreview={previewSide ? (v) => previewSide('Style', v || undefined) : undefined}
                onOptionPreviewClear={previewSide ? onClearPreview : undefined}
              />
            </FieldRow>

            <FieldRow label="Color">
              <ColorValueInput
                id={`border-${editSide}-color`}
                value={colorValue}
                ariaLabel={`Border ${borderLinked ? 'all sides' : editSide.toLowerCase()} color`}
                swatchLabel={`Border ${borderLinked ? 'all sides' : editSide.toLowerCase()} color swatch`}
                onChange={(v) => writeSide('Color', v || undefined)}
                onPreview={onPreview ? (v) => previewSide?.('Color', v || undefined) : undefined}
                onClearPreview={onClearPreview}
              />
            </FieldRow>
          </div>
        </div>
      </div>

      {/* ── Radius ──────────────────────────────────────────────────────── */}
      <div className={styles.group}>
        <div className={styles.groupHeader}>
          <span className={styles.groupTitle}>Radius</span>
          <div className={styles.groupActions}>
            <Button
              variant="ghost"
              size="micro"
              iconOnly
              active={radiusLinked}
              aria-label={radiusLinked ? 'Unlink corners' : 'Link all corners'}
              tooltip={radiusLinked ? 'Editing all corners' : 'Editing one corner'}
              onClick={() => setRadiusLinked((v) => !v)}
            >
              <LinkIcon size={14} aria-hidden="true" />
            </Button>
            {radiusState.anySet && (
              <Button
                variant="ghost"
                size="micro"
                iconOnly
                aria-label="Clear radius"
                tooltip="Clear radius"
                onClick={clearRadius}
              >
                <CloseIcon size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <div className={styles.radiusBody}>
          <CornerPicker
            linked={radiusLinked}
            activeCorner={activeCorner}
            onSelectCorner={(corner) => {
              setRadiusLinked(false)
              setActiveCorner(corner)
            }}
          />
          <div className={styles.fields}>
            <FieldRow label="Radius">
              <Input
                fieldSize="sm"
                value={radiusValue}
                placeholder={radiusPlaceholder}
                aria-label={`Border radius ${radiusLinked ? 'all corners' : cornerLabel(editCorner)}`}
                onChange={(e) => writeRadius(e.target.value || undefined)}
              />
            </FieldRow>
          </div>
        </div>
      </div>

      {/* ── Outline (single shorthand row pair) ─────────────────────────── */}
      <div className={styles.outlineRows}>
        <FieldRow label="Outline">
          <Input
            fieldSize="sm"
            value={pickString(storedStyles.outline)}
            placeholder={pickString(currentStyles.outline) || 'none'}
            aria-label="Outline"
            onChange={(e) => onChange('outline', e.target.value || undefined)}
          />
        </FieldRow>
        <FieldRow label="Offset">
          <Input
            fieldSize="sm"
            value={pickString(storedStyles.outlineOffset)}
            placeholder={pickString(currentStyles.outlineOffset) || '0px'}
            aria-label="Outline offset"
            onChange={(e) => onChange('outlineOffset', e.target.value || undefined)}
          />
        </FieldRow>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldRow — label column + control, matching ControlRow's inline anatomy
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SidePicker — clickable 4-edge box
// ---------------------------------------------------------------------------

interface SidePickerProps {
  linked: boolean
  activeSide: Side
  setSides: Record<Side, string>
  onSelectSide: (side: Side) => void
}

function SidePicker({ linked, activeSide, setSides, onSelectSide }: SidePickerProps) {
  return (
    <div className={styles.sidePicker} role="group" aria-label="Border side">
      <div className={styles.sideBox}>
        {SIDES.map((side) => {
          const isActive = linked || side === activeSide
          const hasValue = setSides[side] !== ''
          return (
            <button
              key={side}
              type="button"
              className={cn(
                styles.sideEdge,
                styles[`side${side}`],
                isActive && styles.sideEdgeActive,
                hasValue && styles.sideEdgeSet,
              )}
              aria-label={`Edit ${side.toLowerCase()} border`}
              aria-pressed={isActive}
              onClick={() => onSelectSide(side)}
            />
          )
        })}
        <span className={styles.sideBoxCore} aria-hidden="true" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CornerPicker — clickable 4-corner box
// ---------------------------------------------------------------------------

function cornerLabel(corner: Corner): string {
  return corner.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

interface CornerPickerProps {
  linked: boolean
  activeCorner: Corner
  onSelectCorner: (corner: Corner) => void
}

function CornerPicker({ linked, activeCorner, onSelectCorner }: CornerPickerProps) {
  return (
    <div className={styles.cornerPicker} role="group" aria-label="Border radius corner">
      <div className={styles.cornerBox}>
        {CORNERS.map((corner) => {
          const isActive = linked || corner === activeCorner
          return (
            <button
              key={corner}
              type="button"
              className={cn(
                styles.cornerDot,
                styles[`corner${corner}`],
                isActive && styles.cornerDotActive,
              )}
              aria-label={`Edit ${cornerLabel(corner)} corner`}
              aria-pressed={isActive}
              onClick={() => onSelectCorner(corner)}
            />
          )
        })}
      </div>
    </div>
  )
}
