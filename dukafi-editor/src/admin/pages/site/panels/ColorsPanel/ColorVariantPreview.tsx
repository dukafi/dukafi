import { ColorInput } from '@ui/components/ColorInput'
import type { ColorPreviewVariable } from './helpers'
import styles from './ColorVariantPreview.module.css'

interface ColorVariantPreviewProps {
  kind: 'Shade' | 'Tint'
  tokenSlug: string
  variables: ColorPreviewVariable[]
}

export function ColorVariantPreview({
  kind,
  tokenSlug,
  variables,
}: ColorVariantPreviewProps) {
  if (variables.length === 0) return null

  return (
    <div className={styles.variantPreview} aria-label={`${kind} previews`}>
      {variables.map((variable) => (
        <ColorInput
          key={variable.name}
          value={variable.value}
          swatchValue={variable.value}
          fieldSize="xs"
          disabled
          aria-label={`${kind} preview ${tokenSlug} ${variable.variantName ?? variable.variantId}`}
        />
      ))}
    </div>
  )
}
