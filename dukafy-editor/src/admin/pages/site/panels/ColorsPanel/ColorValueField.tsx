import { TokenizedColorField } from '@site/property-controls/TokenizedColorField'
import styles from './ColorValueField.module.css'

interface ColorValueFieldProps {
  label: string
  inputLabel: string
  swatchLabel: string
  value: string
  excludeTokenId?: string
  onValueChange: (value: string) => void
  onCommit: (value: string) => void
  placeholder?: string
  fieldClassName?: string
  labelClassName?: string
}

export function ColorValueField({
  label,
  inputLabel,
  swatchLabel,
  value,
  excludeTokenId,
  onValueChange,
  onCommit,
  placeholder,
  fieldClassName = styles.field,
  labelClassName,
}: ColorValueFieldProps) {
  function commit(nextValue = value) {
    onCommit(nextValue)
  }

  return (
    <div className={fieldClassName}>
      <span className={labelClassName}>{label}</span>
      <TokenizedColorField
        value={value}
        inputLabel={inputLabel}
        swatchLabel={swatchLabel}
        placeholder={placeholder}
        excludeTokenId={excludeTokenId}
        onTextChange={onValueChange}
        onTextBlur={() => commit()}
        onSwatchChange={(nextValue) => {
          onValueChange(nextValue)
          commit(nextValue)
        }}
        onTokenSelect={(nextValue) => {
          onValueChange(nextValue)
          commit(nextValue)
        }}
      />
    </div>
  )
}
