/** Relume-style site button defaults. Individual classes/properties win. */
import { useState, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import type { FrameworkButtonsSettings, FrameworkColorToken } from '@core/framework-schema'
import type { FontToken } from '@core/fonts'
import {
  BUTTON_SLIDER_STEPS,
  RADIUS_VALUES as SITE_RADIUS_VALUES,
  buttonRoleVariable,
  resolveButtonPresets,
  resolveColorSchemes,
  resolveSchemeRoleColor,
  type ButtonAppearance,
  type ButtonColorRole,
  type ButtonSliderStep,
} from '@core/framework'
import { Button } from '@ui/components/Button'
import { Select } from '@ui/components/Select'
import { SegmentedControl } from '@ui/components/SegmentedControl'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import { LinkIcon } from 'pixel-art-icons/icons/link'
import { DiscreteSlider } from '@site/panels/SpacingPanel/SpacingPresetsSection'
import styles from './ButtonsPanel.module.css'

const EMPTY_TOKENS: readonly FrameworkColorToken[] = []
const EMPTY_FONTS: readonly FontToken[] = []
const LABELS: Record<ButtonSliderStep, string> = {
  '1': 'XS', '2': 'S', '3': 'Compact', '4': 'Regular', '5': 'M', '6': 'L', '7': 'XL',
}
const ROLE_OPTIONS: ReadonlyArray<{ value: ButtonColorRole; label: string }> = [
  { value: 'accent', label: 'Scheme Accent' }, { value: 'secondary', label: 'Scheme Secondary' },
  { value: 'heading', label: 'Scheme Heading' }, { value: 'body', label: 'Scheme Body' },
  { value: 'border', label: 'Scheme Border' },
]

export function ButtonsPanel() {
  const tokens = useEditorStore((s) => s.site?.settings.framework?.colors?.tokens ?? EMPTY_TOKENS)
  const schemes = resolveColorSchemes(useEditorStore((s) => s.site?.settings.framework?.colorSchemes), tokens)
  const stored = useEditorStore((s) => s.site?.settings.framework?.buttons)
  const fontTokens = useEditorStore((s) => s.site?.settings.fonts?.tokens ?? EMPTY_FONTS)
  const siteRadius = useEditorStore((s) => s.site?.settings.framework?.spacing?.presets?.radius ?? 'md')
  const update = useEditorStore((s) => s.updateFrameworkButtons)
  const [appearance, setAppearance] = useState<ButtonAppearance>('primary')
  const [showAll, setShowAll] = useState(false)
  const presets = resolveButtonPresets(stored)
  const visible = showAll ? schemes : schemes.slice(0, 2)
  const colorKey = `${appearance}Color` as 'primaryColor' | 'secondaryColor' | 'linkColor'

  function patch(next: Partial<FrameworkButtonsSettings>) { update(next) }

  return (
    <div className={styles.root} data-testid="button-presets">
      <p className={styles.hint}>Default button styling. A property or class on a selected button overrides it.</p>
      <SegmentedControl<ButtonAppearance>
        aria-label="Button style" fullWidth size="sm" value={appearance}
        options={[{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'link', label: 'Link' }]}
        onChange={setAppearance}
      />
      <p className={styles.variantHint}>
        {appearance === 'primary'
          ? 'Primary is the default for every button.'
          : <>Apply <code>.button-{appearance}</code> to a button to use this default.</>}
      </p>

      {visible.length > 0 && <div className={styles.previews}>
        {visible.map((scheme) => {
          const role = presets[colorKey] as ButtonColorRole
          const fill = resolveSchemeRoleColor(tokens, scheme.roles[role])
          const background = resolveSchemeRoleColor(tokens, scheme.roles.background)
          const heading = resolveSchemeRoleColor(tokens, scheme.roles.heading)
          const style = {
            '--preview-bg': background, '--preview-fill': fill,
            '--preview-text': appearance === 'primary' ? background : appearance === 'link' ? fill : heading,
            '--preview-radius': presets.radiusLinked ? SITE_RADIUS_VALUES[siteRadius] : radiusValue(presets.radius),
          } as CSSProperties
          return <div key={scheme.id} className={styles.card} style={style}>
            <span className={styles.cardName}>{scheme.name}</span>
            <span className={styles.cardStage}>
              <span className={styles.previewButton} data-appearance={appearance}>Button</span>
            </span>
          </div>
        })}
      </div>}
      {schemes.length > 2 && <Button variant="ghost" size="xs" className={styles.viewAll} onClick={() => setShowAll((x) => !x)}>
        {showAll ? 'View less' : 'View all'} <ChevronDownIcon size={10} aria-hidden="true" />
      </Button>}

      <div className={styles.row}><span className={styles.label}>Color</span><Select fieldSize="sm" aria-label="Color"
        value={presets[colorKey]} options={[...ROLE_OPTIONS]} onChange={(e) => patch({ [colorKey]: e.currentTarget.value as ButtonColorRole })} /></div>

      <h4 className={styles.subhead}>All buttons</h4>
      <DiscreteSlider label="Padding" value={presets.padding} options={sliderOptions()} onChange={(padding) => patch({ padding })} />
      <DiscreteSlider label="Radius" value={presets.radius} options={sliderOptions()} disabled={presets.radiusLinked}
        trailing={<Button variant={presets.radiusLinked ? 'primary' : 'ghost'} size="xs" iconOnly aria-label="Link radius to site radius" tooltip="Link to site radius" onClick={() => patch({ radiusLinked: !presets.radiusLinked })}><LinkIcon size={12} /></Button>}
        onChange={(radius) => patch({ radius })} />
      <div className={styles.row}><span className={styles.label}>Font</span><Select fieldSize="sm" aria-label="Font"
        value={presets.fontVariable} options={[{ value: 'inherit', label: 'Inherit' }, ...fontTokens.map((f) => ({ value: f.variable, label: f.name }))]}
        onChange={(e) => patch({ fontVariable: e.currentTarget.value })} /></div>
      <DiscreteSlider label="Font Size" value={presets.fontSize} options={sliderOptions()} onChange={(fontSize) => patch({ fontSize })} />
      <DiscreteSlider label="Font Weight" value={presets.fontWeight} options={weightOptions()} onChange={(fontWeight) => patch({ fontWeight })} />
      <div className={styles.row}><span className={styles.label}>Case</span><SegmentedControl<'normal' | 'capitalize' | 'uppercase'> aria-label="Case" fullWidth size="sm" value={presets.casing}
        options={[{ value: 'normal', label: '—' }, { value: 'capitalize', label: 'Ag' }, { value: 'uppercase', label: 'AG' }]}
        onChange={(casing) => patch({ casing })} /></div>
      <DiscreteSlider label="Letter Spacing" value={presets.letterSpacing} options={sliderOptions()} onChange={(letterSpacing) => patch({ letterSpacing })} />
      <span className={styles.srOnly}>{buttonRoleVariable(presets[colorKey] as ButtonColorRole)}</span>
    </div>
  )
}

function sliderOptions() { return BUTTON_SLIDER_STEPS.map((value) => ({ value, label: LABELS[value] })) }
function weightOptions() { return BUTTON_SLIDER_STEPS.map((value, i) => ({ value, label: String([300, 400, 450, 500, 600, 700, 800][i]) })) }
function radiusValue(step: ButtonSliderStep) { return ['0', '.125rem', '.25rem', '.5rem', '.75rem', '1rem', '9999px'][Number(step) - 1] }
