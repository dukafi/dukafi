import { Button } from '@ui/components/Button'
import { MinusIcon } from 'pixel-art-icons/icons/minus'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { MAX_VARIANT_COUNT } from './helpers'
import styles from './VariantCountStepper.module.css'

interface VariantCountStepperProps {
  label: 'Shade' | 'Tint'
  count: number
  onCountChange: (count: number) => void
}

export function VariantCountStepper({
  label,
  count,
  onCountChange,
}: VariantCountStepperProps) {
  const min = 0
  const max = MAX_VARIANT_COUNT
  const lowerLabel = label.toLowerCase()

  return (
    <div
      className={styles.stepperRow}
      role="group"
      aria-label={`${label} variants`}
    >
      <span>{label} variants</span>
      <div className={styles.stepperControl}>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Decrease ${lowerLabel} variants`}
          disabled={count <= min}
          onClick={() => onCountChange(Math.max(min, count - 1))}
        >
          <MinusIcon size={12} aria-hidden="true" />
        </Button>
        <span className={styles.stepperValue} aria-live="polite">
          {count}
        </span>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Increase ${lowerLabel} variants`}
          disabled={count >= max}
          onClick={() => onCountChange(Math.min(max, count + 1))}
        >
          <PlusIcon size={12} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
