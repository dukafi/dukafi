import { Button } from '@ui/components/Button'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import styles from './RatioModeToggle.module.css'

/**
 * Compact "switch the ratio field between preset list and custom number"
 * toggle. Designed to sit in the labelSuffix slot of a ControlRow so it
 * never competes with the input for horizontal space.
 */
export function RatioModeToggle({
  isCustom,
  ariaLabel,
  onToggle,
}: {
  isCustom: boolean
  ariaLabel: string
  onToggle: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      iconOnly
      className={styles.ratioToggle}
      aria-label={ariaLabel}
      tooltip={isCustom ? 'Choose preset ratio' : 'Enter custom ratio'}
      pressed={isCustom}
      onClick={onToggle}
    >
      <EditSolidIcon size={11} aria-hidden="true" />
    </Button>
  )
}
