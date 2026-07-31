import type { CmsCurrentUser, CmsStepUpAuthMode, CmsStepUpWindowMinutes } from '@core/persistence'
import { updateCurrentUserStepUpSettings } from '@core/persistence'
import { Select } from '@ui/components/Select'
import { Switch } from '@ui/components/Switch'
import { SecurityCard } from './SecurityCard'
import { isStepUpCancelled } from './securityErrors'
import styles from '../AccountPage.module.css'
import { getErrorMessage } from '@core/utils/errorMessage'

interface StepUpSettingsCardProps {
  user: CmsCurrentUser
  busy: string | null
  runStepUp: <T>(fn: () => Promise<T>) => Promise<T>
  setSessionUser: (user: CmsCurrentUser) => void
  setBusy: (v: string | null) => void
  setError: (v: string | null) => void
  setStatus: (v: string | null) => void
}

const STEP_UP_WINDOW_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
]

function parseStepUpWindowMinutes(value: string): CmsStepUpWindowMinutes | null {
  if (value === '5') return 5
  if (value === '15') return 15
  if (value === '30') return 30
  if (value === '60') return 60
  return null
}

async function updateStepUpSettings(
  input: {
    mode: CmsStepUpAuthMode
    windowMinutes: CmsStepUpWindowMinutes
  },
  props: StepUpSettingsCardProps,
): Promise<void> {
  const { runStepUp, setSessionUser, setBusy, setError, setStatus } = props
  try {
    const updated = await runStepUp(() => updateCurrentUserStepUpSettings(input))
    setSessionUser(updated)
    setStatus(
      updated.stepUpAuthMode === 'required'
        ? `Step-up authentication updated to ${updated.stepUpWindowMinutes} minutes.`
        : 'Step-up authentication disabled.',
    )
  } catch (err) {
    if (!isStepUpCancelled(err)) {
      setError(getErrorMessage(err, 'Could not update step-up authentication.'))
    }
  } finally {
    setBusy(null)
  }
}

export function StepUpSettingsCard(props: StepUpSettingsCardProps) {
  const { user, busy, setBusy, setError, setStatus } = props
  const stepUpEnabled = user.stepUpAuthMode === 'required'
  const stepUpStatus = stepUpEnabled
    ? `On - sensitive actions ask again after ${user.stepUpWindowMinutes} minutes.`
    : 'Off - sensitive actions use the active session only.'

  async function handleModeChange(checked: boolean): Promise<void> {
    if (busy) return
    const mode: CmsStepUpAuthMode = checked ? 'required' : 'disabled'
    if (mode === user.stepUpAuthMode) return
    setBusy('step-up')
    setError(null)
    setStatus(null)
    await updateStepUpSettings({ mode, windowMinutes: user.stepUpWindowMinutes }, props)
  }

  async function handleWindowChange(value: string): Promise<void> {
    if (busy) return
    const windowMinutes = parseStepUpWindowMinutes(value)
    if (windowMinutes === null || windowMinutes === user.stepUpWindowMinutes) return
    setBusy('step-up-window')
    setError(null)
    setStatus(null)
    await updateStepUpSettings({ mode: user.stepUpAuthMode, windowMinutes }, props)
  }

  return (
    <SecurityCard
      testId="security-step-up-card"
      title="Step-up authentication"
      description="Require password confirmation again before sensitive account and publishing actions."
      status={stepUpStatus}
      statusActive={stepUpEnabled}
      action={
        <div className={styles.stepUpControls}>
          <div className={styles.switchControl}>
            <Switch
              checked={stepUpEnabled}
              disabled={busy !== null}
              switchSize="sm"
              onCheckedChange={(checked) => void handleModeChange(checked)}
              aria-label="Require step-up authentication"
              data-testid="security-step-up-toggle"
            />
            <span>{stepUpEnabled ? 'Required' : 'Disabled'}</span>
          </div>
          <Select
            value={String(user.stepUpWindowMinutes)}
            options={STEP_UP_WINDOW_OPTIONS}
            fieldSize="sm"
            disabled={busy !== null || !stepUpEnabled}
            aria-label="Step-up window"
            data-testid="security-step-up-window"
            onChange={(event) => void handleWindowChange(event.currentTarget.value)}
          />
        </div>
      }
    />
  )
}
