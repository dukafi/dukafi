import { useState, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import type { FrameworkColorToken, FrameworkInputsSettings } from '@core/framework-schema'
import type { FontToken } from '@core/fonts'
import {
  INPUT_SLIDER_STEPS, RADIUS_VALUES as SITE_RADIUS_VALUES, resolveColorSchemes,
  resolveInputPresets, resolveSchemeRoleColor, type InputColorRole, type InputSliderStep,
} from '@core/framework'
import { Button } from '@ui/components/Button'
import { Select } from '@ui/components/Select'
import { ChevronDownIcon } from 'pixel-art-icons/icons/chevron-down'
import { LinkIcon } from 'pixel-art-icons/icons/link'
import { DiscreteSlider } from '@site/panels/SpacingPanel/SpacingPresetsSection'
import styles from './InputsPanel.module.css'

const EMPTY_TOKENS: readonly FrameworkColorToken[] = []
const EMPTY_FONTS: readonly FontToken[] = []
const LABELS: Record<InputSliderStep, string> = { '1': 'XS', '2': 'S', '3': 'Compact', '4': 'Regular', '5': 'M', '6': 'L', '7': 'XL' }
const ROLE_OPTIONS: ReadonlyArray<{ value: InputColorRole; label: string }> = [
  { value: 'background', label: 'Scheme Background' }, { value: 'accent', label: 'Scheme Accent' },
  { value: 'secondary', label: 'Scheme Secondary' }, { value: 'heading', label: 'Scheme Heading' },
  { value: 'body', label: 'Scheme Body' }, { value: 'border', label: 'Scheme Border' },
]

export function InputsPanel() {
  const tokens = useEditorStore((s) => s.site?.settings.framework?.colors?.tokens ?? EMPTY_TOKENS)
  const schemes = resolveColorSchemes(useEditorStore((s) => s.site?.settings.framework?.colorSchemes), tokens)
  const stored = useEditorStore((s) => s.site?.settings.framework?.inputs)
  const fontTokens = useEditorStore((s) => s.site?.settings.fonts?.tokens ?? EMPTY_FONTS)
  const siteRadius = useEditorStore((s) => s.site?.settings.framework?.spacing?.presets?.radius ?? 'md')
  const update = useEditorStore((s) => s.updateFrameworkInputs)
  const [showAll, setShowAll] = useState(false)
  const presets = resolveInputPresets(stored)
  const visible = showAll ? schemes : schemes.slice(0, 2)
  const patch = (next: Partial<FrameworkInputsSettings>) => update(next)

  return <div className={styles.root} data-testid="input-presets">
    <p className={styles.hint}>Default text field styling. A property or class on an input overrides it.</p>
    {visible.length > 0 && <div className={styles.previews}>{visible.map((scheme) => {
      const roleColor = (role: InputColorRole) => resolveSchemeRoleColor(tokens, scheme.roles[role])
      const style = {
        '--preview-stage': roleColor('background'), '--preview-bg': roleColor(presets.backgroundColor),
        '--preview-text': roleColor(presets.textColor), '--preview-border': roleColor(presets.borderColor),
        '--preview-focus': roleColor(presets.focusColor),
        '--preview-radius': presets.radiusLinked ? SITE_RADIUS_VALUES[siteRadius] : radiusValue(presets.radius),
      } as CSSProperties
      return <div key={scheme.id} className={styles.card} style={style}>
        <span className={styles.cardName}>{scheme.name}</span>
        <span className={styles.cardStage}><span className={styles.previewInput}>Email address</span></span>
      </div>
    })}</div>}
    {schemes.length > 2 && <Button variant="ghost" size="xs" className={styles.viewAll} onClick={() => setShowAll((x) => !x)}>
      {showAll ? 'View less' : 'View all'} <ChevronDownIcon size={10} aria-hidden="true" />
    </Button>}

    <ColorRow label="Background" value={presets.backgroundColor} onChange={(backgroundColor) => patch({ backgroundColor })} />
    <ColorRow label="Text" value={presets.textColor} onChange={(textColor) => patch({ textColor })} />
    <ColorRow label="Border" value={presets.borderColor} onChange={(borderColor) => patch({ borderColor })} />
    <ColorRow label="Focus" value={presets.focusColor} onChange={(focusColor) => patch({ focusColor })} />
    <h4 className={styles.subhead}>All inputs</h4>
    <DiscreteSlider label="Padding" value={presets.padding} options={sliderOptions()} onChange={(padding) => patch({ padding })} />
    <DiscreteSlider label="Stroke" value={presets.borderWidth} options={sliderOptions()} onChange={(borderWidth) => patch({ borderWidth })} />
    <DiscreteSlider label="Radius" value={presets.radius} options={sliderOptions()} disabled={presets.radiusLinked}
      trailing={<Button variant={presets.radiusLinked ? 'primary' : 'ghost'} size="xs" iconOnly aria-label="Link radius to site radius" tooltip="Link to site radius" onClick={() => patch({ radiusLinked: !presets.radiusLinked })}><LinkIcon size={12} /></Button>}
      onChange={(radius) => patch({ radius })} />
    <div className={styles.row}><span className={styles.label}>Font</span><Select fieldSize="sm" aria-label="Input font"
      value={presets.fontVariable} options={[{ value: 'inherit', label: 'Inherit' }, ...fontTokens.map((f) => ({ value: f.variable, label: f.name }))]}
      onChange={(e) => patch({ fontVariable: e.currentTarget.value })} /></div>
    <DiscreteSlider label="Font Size" value={presets.fontSize} options={sliderOptions()} onChange={(fontSize) => patch({ fontSize })} />
    <DiscreteSlider label="Font Weight" value={presets.fontWeight} options={weightOptions()} onChange={(fontWeight) => patch({ fontWeight })} />
  </div>
}

function ColorRow({ label, value, onChange }: { label: string; value: InputColorRole; onChange: (value: InputColorRole) => void }) {
  return <div className={styles.row}><span className={styles.label}>{label}</span><Select fieldSize="sm" aria-label={`${label} color`}
    value={value} options={[...ROLE_OPTIONS]} onChange={(e) => onChange(e.currentTarget.value as InputColorRole)} /></div>
}
function sliderOptions() { return INPUT_SLIDER_STEPS.map((value) => ({ value, label: LABELS[value] })) }
function weightOptions() { return INPUT_SLIDER_STEPS.map((value, i) => ({ value, label: String([300, 400, 450, 500, 600, 700, 800][i]) })) }
function radiusValue(step: InputSliderStep) { return ['0', '.125rem', '.25rem', '.5rem', '.75rem', '1rem', '9999px'][Number(step) - 1] }
