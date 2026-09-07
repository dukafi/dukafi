/**
 * Site icon defaults — glyph and the box around it, previewed per scheme.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import type { FrameworkColorScheme, FrameworkColorToken, FrameworkIconsSettings } from '@core/framework-schema'
import {
  ICON_SLIDER_STEPS,
  RADIUS_VALUES as SITE_RADIUS_VALUES,
  resolveColorSchemes,
  resolveIconPresets,
  resolveSchemeRoleColor,
  type IconColorRole,
  type IconSliderStep,
} from '@core/framework'
import { Button } from '@ui/components/Button'
import { Select } from '@ui/components/Select'
import { SegmentedControl } from '@ui/components/SegmentedControl'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import { LinkIcon } from 'pixel-art-icons/icons/link'
import { StarSolidIcon } from 'pixel-art-icons/icons/star-solid'
import { DiscreteSlider } from '@site/panels/SpacingPanel/SpacingPresetsSection'
import styles from './IconsPanel.module.css'

const EMPTY_TOKENS: readonly FrameworkColorToken[] = []

const COLOR_OPTIONS: ReadonlyArray<{ value: IconColorRole; label: string }> = [
  { value: 'accent', label: 'Scheme Accent' },
  { value: 'heading', label: 'Scheme Heading' },
  { value: 'body', label: 'Scheme Body' },
  { value: 'border', label: 'Scheme Border' },
]

const WEIGHT_LABELS: Record<IconSliderStep, string> = {
  '1': 'Hairline',
  '2': 'Thin',
  '3': 'Light',
  '4': 'Regular',
  '5': 'Medium',
  '6': 'Semibold',
  '7': 'Bold',
}

const PADDING_LABELS: Record<IconSliderStep, string> = {
  '1': 'None',
  '2': '2XS',
  '3': 'XS',
  '4': 'S',
  '5': 'M',
  '6': 'L',
  '7': 'XL',
}

const RADIUS_LABELS: Record<IconSliderStep, string> = {
  '1': 'None',
  '2': '2XS',
  '3': 'XS',
  '4': 'S',
  '5': 'M',
  '6': 'L',
  '7': 'Rounded',
}

const PADDING_VALUES: Record<IconSliderStep, string> = {
  '1': '0',
  '2': '0.25rem',
  '3': '0.375rem',
  '4': '0.5rem',
  '5': '0.75rem',
  '6': '1rem',
  '7': '1.25rem',
}

const RADIUS_VALUES: Record<IconSliderStep, string> = {
  '1': '0',
  '2': '0.125rem',
  '3': '0.25rem',
  '4': '0.5rem',
  '5': '0.75rem',
  '6': '1rem',
  '7': '9999px',
}

type PreviewStyle = CSSProperties & {
  '--icon-preview-color'?: string
  '--icon-preview-bg'?: string
  '--icon-preview-border'?: string
  '--icon-preview-radius'?: string
  '--icon-preview-padding'?: string
}

export function IconsPanel() {
  const tokens = useEditorStore((s) => s.site?.settings.framework?.colors?.tokens ?? EMPTY_TOKENS)
  const storedSchemes = useEditorStore((s) => s.site?.settings.framework?.colorSchemes)
  const storedIcons = useEditorStore((s) => s.site?.settings.framework?.icons)
  const siteRadius = useEditorStore((s) => s.site?.settings.framework?.spacing?.presets?.radius)
  const updateFrameworkIcons = useEditorStore((s) => s.updateFrameworkIcons)
  const presets = resolveIconPresets(storedIcons)
  const schemes = resolveColorSchemes(storedSchemes, tokens)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? schemes : schemes.slice(0, 2)

  function patch(next: Partial<FrameworkIconsSettings>) {
    updateFrameworkIcons(next)
  }

  return (
    <div className={styles.root} data-testid="icon-presets">
      <p className={styles.hint}>
        Default look for inline SVGs. Properties or a class on a selected icon override it.
      </p>

      {visible.length > 0 && (
        <div className={styles.previews}>
          {visible.map((scheme) => (
            <SchemeIconPreview
              key={scheme.id}
              scheme={scheme}
              tokens={tokens}
              presets={presets}
              siteRadius={siteRadius}
            />
          ))}
        </div>
      )}

      {schemes.length > 2 && (
        <Button
          variant="ghost"
          size="xs"
          className={styles.viewAll}
          onClick={() => setShowAll((open) => !open)}
        >
          {showAll ? 'View less' : 'View all'}
          <ChevronDownIcon size={10} aria-hidden="true" />
        </Button>
      )}

      <div className={styles.row}>
        <span className={styles.label}>Color</span>
        <Select
          fieldSize="sm"
          aria-label="Color"
          value={presets.color}
          options={COLOR_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(event) => patch({ color: event.currentTarget.value as IconColorRole })}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Style</span>
        <Select
          fieldSize="sm"
          aria-label="Style"
          value={presets.style}
          options={[
            { value: 'outlined', label: 'Outlined' },
            { value: 'filled', label: 'Filled' },
          ]}
          onChange={(event) => patch({ style: event.currentTarget.value as 'outlined' | 'filled' })}
        />
      </div>

      <DiscreteSlider
        label="Icon Weight"
        value={presets.weight}
        options={ICON_SLIDER_STEPS.map((value) => ({ value, label: WEIGHT_LABELS[value] }))}
        onChange={(weight) => patch({ weight })}
      />

      <div className={styles.row}>
        <span className={styles.label}>Fill</span>
        <SegmentedControl<'outline' | 'fill'>
          aria-label="Fill"
          fullWidth
          size="sm"
          value={presets.fill}
          options={[
            { value: 'outline', label: 'Outline' },
            { value: 'fill', label: 'Fill' },
          ]}
          onChange={(fill) => patch({ fill })}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Treatment</span>
        <Select
          fieldSize="sm"
          aria-label="Treatment"
          value={presets.treatment}
          options={[
            { value: 'none', label: 'None' },
            { value: 'fill', label: 'Fill' },
            { value: 'outline', label: 'Outline' },
          ]}
          onChange={(event) => patch({ treatment: event.currentTarget.value as FrameworkIconsSettings['treatment'] })}
        />
      </div>

      {presets.treatment === 'fill' && (
        <div className={styles.row}>
          <span className={styles.label}>Fill Intensity</span>
          <SegmentedControl<'subtle' | 'strong'>
            aria-label="Fill Intensity"
            fullWidth
            size="sm"
            value={presets.fillIntensity}
            options={[
              { value: 'subtle', label: 'Subtle' },
              { value: 'strong', label: 'Strong' },
            ]}
            onChange={(fillIntensity) => patch({ fillIntensity })}
          />
        </div>
      )}

      <DiscreteSlider
        label="Padding"
        value={presets.padding}
        options={ICON_SLIDER_STEPS.map((value) => ({ value, label: PADDING_LABELS[value] }))}
        onChange={(padding) => patch({ padding })}
      />

      <DiscreteSlider
        label="Radius"
        value={presets.radius}
        disabled={presets.radiusLinked}
        options={ICON_SLIDER_STEPS.map((value) => ({
          value,
          label: presets.radiusLinked ? 'Linked' : RADIUS_LABELS[value],
        }))}
        onChange={(radius) => patch({ radius, radiusLinked: false })}
        trailing={
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            pressed={presets.radiusLinked}
            aria-label={presets.radiusLinked ? 'Unlink from site radius' : 'Link to site radius'}
            tooltip={presets.radiusLinked ? 'Using site radius' : 'Link to site radius'}
            onClick={() => patch({ radiusLinked: !presets.radiusLinked })}
          >
            <LinkIcon size={12} aria-hidden="true" />
          </Button>
        }
      />
    </div>
  )
}

function SchemeIconPreview({
  scheme,
  tokens,
  presets,
  siteRadius,
}: {
  scheme: FrameworkColorScheme
  tokens: readonly FrameworkColorToken[]
  presets: FrameworkIconsSettings
  siteRadius: string | undefined
}) {
  const style = useMemo(
    () => previewBoxStyle(scheme, tokens, presets, siteRadius),
    [scheme, tokens, presets, siteRadius],
  )
  return (
    <div className={styles.card}>
      <div className={styles.cardStage} style={{ backgroundColor: resolveSchemeRoleColor(tokens, scheme.roles.background) }}>
        <span className={styles.iconBox} style={style}>
          <StarSolidIcon size={18} aria-hidden="true" />
        </span>
      </div>
      <span className={styles.cardName}>{scheme.name}</span>
    </div>
  )
}

function previewBoxStyle(
  scheme: FrameworkColorScheme,
  tokens: readonly FrameworkColorToken[],
  presets: FrameworkIconsSettings,
  siteRadius: string | undefined,
): PreviewStyle {
  const role = presets.color
  const ink = resolveSchemeRoleColor(tokens, scheme.roles[role])
  const onAccent = resolveSchemeRoleColor(tokens, scheme.roles.background)
  const strong = presets.fillIntensity === 'strong'
  const padding = presets.treatment === 'none' ? '0' : PADDING_VALUES[presets.padding]
  const radius = presets.radiusLinked
    ? SITE_RADIUS_VALUES[siteRadius === 'none' || siteRadius === 'sm' || siteRadius === 'md' || siteRadius === 'lg' || siteRadius === 'full' ? siteRadius : 'md']
    : RADIUS_VALUES[presets.radius]
  let background = 'transparent'
  let border = '0 solid transparent'
  let color = ink
  if (presets.treatment === 'fill') {
    background = strong ? ink : `color-mix(in srgb, ${ink} 12%, transparent)`
    if (strong) color = onAccent
  } else if (presets.treatment === 'outline') {
    border = `1px solid ${ink}`
  }
  return {
    '--icon-preview-color': color,
    '--icon-preview-bg': background,
    '--icon-preview-border': border,
    '--icon-preview-radius': radius,
    '--icon-preview-padding': padding,
  }
}
