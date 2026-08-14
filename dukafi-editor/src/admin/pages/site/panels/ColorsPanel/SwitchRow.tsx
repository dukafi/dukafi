import { Switch } from '@ui/components/Switch'
import styles from './SwitchRow.module.css'

interface SwitchRowProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function SwitchRow({ label, checked, onCheckedChange }: SwitchRowProps) {
  return (
    <div className={styles.checkboxRow}>
      <span>{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        switchSize="sm"
        aria-label={label}
      />
    </div>
  )
}
