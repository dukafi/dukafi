import { useEffect } from 'react'
import type { ControlProps } from './shared'
import { Select } from '@ui/components/Select'
import { ControlRow } from '@ui/components/ControlRow'
import { useEditorPreference } from '@site/preferences/editorPreferences'

interface SelectOption {
  label: string
  value: unknown
}

interface SelectControlProps extends ControlProps<unknown> {
  options: SelectOption[]
  placeholder?: string
  /**
   * Optional hover-preview hooks. When provided (and the `hoverPreview`
   * editor preference is on), hovering an option in the open dropdown
   * transiently applies its value via `onPreview`; leaving / closing the
   * menu fires `onClearPreview`. Used by the style-rules panel so designing
   * is interactive — see ClassPropertyRow. Module-prop selects omit these.
   */
  onPreview?: (value: string) => void
  onClearPreview?: () => void
}

export function SelectControl({
  propKey,
  value,
  onChange,
  label,
  options,
  placeholder,
  isOverride,
  disabled,
  layout,
  onPreview,
  onClearPreview,
}: SelectControlProps) {
  // Hover previews are gated by the shared "Preview suggestions on hover"
  // preference. When off we never wire the preview callbacks through, so the
  // dropdown behaves like a plain select.
  const hoverPreviewEnabled = useEditorPreference('hoverPreview')
  const previewActive = hoverPreviewEnabled && onPreview != null

  // Defensive: if the preference flips off while a preview is live, clear it.
  useEffect(() => {
    if (!hoverPreviewEnabled) onClearPreview?.()
  }, [hoverPreviewEnabled, onClearPreview])

  return (
    <ControlRow
      propKey={propKey}
      label={label}
      layout={layout}
      isOverride={isOverride}
      disabled={disabled}
    >
      <Select
        id={`ctrl-${propKey}`}
        value={String(value ?? '')}
        placeholder={placeholder}
        disabled={disabled}
        fieldSize="sm"
        onChange={(e) => {
          const raw = e.target.value
          const matched = options.find((o) => String(o.value) === raw)
          onChange(propKey, matched !== undefined ? matched.value : raw)
        }}
        onOptionPreview={previewActive ? onPreview : undefined}
        onOptionPreviewClear={previewActive ? onClearPreview : undefined}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </Select>
    </ControlRow>
  )
}
