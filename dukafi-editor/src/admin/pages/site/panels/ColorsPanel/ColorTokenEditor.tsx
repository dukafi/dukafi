import { useId, useState } from 'react'
import {
  generateFrameworkColorVariableSets,
  normalizeFrameworkColorSlug,
} from '@core/framework'
import type { FrameworkColorToken } from '@core/framework-schema'
import type { UpdateFrameworkColorTokenPatch } from '@site/store/slices/site/types'
import { Input } from '@ui/components/Input'
import { CategoryComboBox } from './CategoryComboBox'
import { ColorValueField } from './ColorValueField'
import { ColorVariantPreview } from './ColorVariantPreview'
import { SwitchRow } from './SwitchRow'
import { VariantCountStepper } from './VariantCountStepper'
import { UTILITY_OPTIONS, clampVariantCountInput } from './helpers'
import styles from './ColorTokenEditor.module.css'

interface ColorTokenEditorProps {
  token: FrameworkColorToken
  categories: string[]
  onPatch: (patch: UpdateFrameworkColorTokenPatch) => void
}

export function ColorTokenEditor({
  token,
  categories,
  onPatch,
}: ColorTokenEditorProps) {
  const [slug, setSlug] = useState(token.slug)
  const slugInputId = useId()
  const [lightValue, setLightValue] = useState(token.lightValue)
  const [alternateValue, setAlternateValue] = useState(
    token.darkModeEnabled ? token.darkValue : '',
  )
  const [category, setCategory] = useState(token.category)
  const [shadeCount, setShadeCount] = useState(
    String(token.generateShades.count),
  )
  const [tintCount, setTintCount] = useState(String(token.generateTints.count))

  const previewToken: FrameworkColorToken = {
    ...token,
    lightValue: lightValue.trim() || token.lightValue,
    darkValue: alternateValue.trim() || token.darkValue,
    darkModeEnabled: alternateValue.trim().length > 0,
    generateShades: {
      ...token.generateShades,
      count: clampVariantCountInput(shadeCount),
    },
    generateTints: {
      ...token.generateTints,
      count: clampVariantCountInput(tintCount),
    },
  }

  const previewVariables = generateFrameworkColorVariableSets({
    tokens: [previewToken],
  }).light
  const shadeVariables = previewVariables.filter((variable) =>
    variable.variantName?.startsWith('d-'),
  )
  const tintVariables = previewVariables.filter((variable) =>
    variable.variantName?.startsWith('l-'),
  )

  // Resync local edit state with the upstream token whenever any of the
  // mirrored fields change (parent commit, undo/redo, external patch). Done
  // via a render-time previous-value comparison rather than useEffect+setState
  // so the form doesn't render once with stale values before snapping to the
  // new token. See React's "store information from previous renders" pattern.
  const tokenSnapshot =
    token.id +
    '|' +
    token.category +
    '|' +
    token.slug +
    '|' +
    token.lightValue +
    '|' +
    String(token.darkModeEnabled) +
    '|' +
    token.darkValue +
    '|' +
    token.generateShades.count +
    '|' +
    token.generateTints.count
  const [lastTokenSnapshot, setLastTokenSnapshot] = useState(tokenSnapshot)
  if (lastTokenSnapshot !== tokenSnapshot) {
    setLastTokenSnapshot(tokenSnapshot)
    setSlug(token.slug)
    setLightValue(token.lightValue)
    setAlternateValue(token.darkModeEnabled ? token.darkValue : '')
    setCategory(token.category)
    setShadeCount(String(token.generateShades.count))
    setTintCount(String(token.generateTints.count))
  }

  function commitLightValue(nextValue = lightValue) {
    onPatch({ lightValue: nextValue })
  }

  function commitAlternateValue(nextValue = alternateValue) {
    const trimmed = nextValue.trim()
    onPatch({
      darkValue: trimmed,
      darkModeEnabled: trimmed.length > 0,
    })
  }

  function commitCategory(nextValue = category) {
    const trimmed = nextValue.trim()
    setCategory(trimmed)
    if (trimmed !== token.category) onPatch({ category: trimmed })
  }

  function commitVariantCount(kind: 'shade' | 'tint', value: string) {
    const nextCount = clampVariantCountInput(value)
    if (kind === 'shade') {
      setShadeCount(String(nextCount))
      onPatch({ generateShades: { count: nextCount } })
    } else {
      setTintCount(String(nextCount))
      onPatch({ generateTints: { count: nextCount } })
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.field}>
        <label htmlFor={slugInputId}>Token name</label>
        <Input
          id={slugInputId}
          fieldSize="sm"
          value={slug}
          aria-label="Token name"
          prefix="--"
          onChange={(event) => setSlug(event.target.value)}
          onBlur={() => {
            const nextSlug = normalizeFrameworkColorSlug(slug)
            setSlug(nextSlug)
            onPatch({ slug: nextSlug })
          }}
        />
      </div>

      <CategoryComboBox
        label="Category"
        suggestions={categories}
        excludeCategory={token.category}
        value={category}
        onValueChange={setCategory}
        onCommit={commitCategory}
        fieldClassName={styles.field}
      />

      <ColorValueField
        label="Default color"
        inputLabel="Default color"
        swatchLabel={`Default color swatch ${token.slug}`}
        value={lightValue}
        excludeTokenId={token.id}
        onValueChange={setLightValue}
        onCommit={commitLightValue}
      />

      <ColorValueField
        label="Alt color"
        inputLabel="Alt color"
        swatchLabel={`Alternate color swatch ${token.slug}`}
        value={alternateValue}
        excludeTokenId={token.id}
        onValueChange={setAlternateValue}
        onCommit={commitAlternateValue}
        placeholder="Optional"
      />

      <div className={styles.utilityGrid} aria-label="Generate utility classes">
        {UTILITY_OPTIONS.map((option) => (
          <SwitchRow
            key={option.key}
            label={option.label}
            checked={token.generateUtilities[option.key]}
            onCheckedChange={(checked) =>
              onPatch({
                generateUtilities: { [option.key]: checked },
              })
            }
          />
        ))}
      </div>

      <SwitchRow
        label="Transparent variants"
        checked={token.generateTransparent}
        onCheckedChange={(checked) => onPatch({ generateTransparent: checked })}
      />

      <div className={styles.variantControl}>
        <SwitchRow
          label="Generate shades"
          checked={token.generateShades.enabled}
          onCheckedChange={(checked) =>
            onPatch({ generateShades: { enabled: checked } })
          }
        />
        {token.generateShades.enabled && (
          <>
            <VariantCountStepper
              label="Shade"
              count={clampVariantCountInput(shadeCount)}
              onCountChange={(count) =>
                commitVariantCount('shade', String(count))
              }
            />
            <ColorVariantPreview
              kind="Shade"
              tokenSlug={token.slug}
              variables={shadeVariables}
            />
          </>
        )}
      </div>

      <div className={styles.variantControl}>
        <SwitchRow
          label="Generate tints"
          checked={token.generateTints.enabled}
          onCheckedChange={(checked) =>
            onPatch({ generateTints: { enabled: checked } })
          }
        />
        {token.generateTints.enabled && (
          <>
            <VariantCountStepper
              label="Tint"
              count={clampVariantCountInput(tintCount)}
              onCountChange={(count) =>
                commitVariantCount('tint', String(count))
              }
            />
            <ColorVariantPreview
              kind="Tint"
              tokenSlug={token.slug}
              variables={tintVariables}
            />
          </>
        )}
      </div>
    </div>
  )
}
