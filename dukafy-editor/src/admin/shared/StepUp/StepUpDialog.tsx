/**
 * StepUpDialog — pure presentational dialog used by `StepUpProvider`.
 *
 * Modal that asks the current user to re-enter their password, plus an
 * authenticator/recovery code when MFA is enabled. On submit, the parent
 * provider POSTs to `/admin/api/cms/auth/step-up` and (on success) retries
 * the original sensitive action; on cancel, the provider rejects the pending
 * promise with `step_up_cancelled`.
 *
 * The component is intentionally state-light — `password`, `error`,
 * `submitting` are owned here, but the *flow state* (which action is
 * pending, whether to retry) lives in the provider.
 *
 * No native `<dialog>`: the editor shell already uses portal-rendered
 * `role="dialog"` overlays elsewhere (see `SettingsModal`), and the same
 * idiom (backdrop + ESC + focus management on the Cancel button) gives
 * consistent behaviour across the admin.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import styles from './StepUpDialog.module.css'

interface StepUpSubmitInput {
  password: string
  mfaCode?: string
}

interface StepUpDialogProps {
  /** Why the action requires re-auth — shown above the password field. */
  reason?: string
  /** True when the current user must also provide their MFA code. */
  mfaRequired: boolean
  /** True while a step-up POST or the original action is in flight. */
  submitting: boolean
  /** Last error message to render under the input (wrong password, etc.). */
  error: string | null
  onSubmit: (input: StepUpSubmitInput) => void
  onCancel: () => void
}

export function StepUpDialog({
  reason,
  mfaRequired,
  submitting,
  error,
  onSubmit,
  onCancel,
}: StepUpDialogProps) {
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const titleId = useId()
  const passwordId = useId()
  const mfaCodeId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus the cancel button on open so ESC / Tab feel right. The password
  // input takes focus the moment the user hits Tab once.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // ESC closes the dialog (treated as cancel).
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || password.length === 0) return
    if (mfaRequired && mfaCode.trim().length === 0) return
    onSubmit({
      password,
      ...(mfaRequired ? { mfaCode } : {}),
    })
  }

  const confirmDisabled = submitting || password.length === 0 || (mfaRequired && mfaCode.trim().length === 0)

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(event) => {
        // Backdrop click cancels the action — same affordance as ESC.
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        data-testid="step-up-dialog"
      >
        <h2 id={titleId} className={styles.title}>Confirm your password</h2>
        <p className={styles.body}>
          {reason ?? (
            mfaRequired
              ? 'This action requires your password and a current authentication code.'
              : 'This action requires a recent password re-entry. You\'ll stay signed in here.'
          )}
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor={passwordId} className={styles.label}>Password</label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              disabled={submitting}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              data-testid="step-up-password"
            />
          </div>
          {mfaRequired && (
            <div className={styles.field}>
              <label htmlFor={mfaCodeId} className={styles.label}>Authentication or recovery code</label>
              <Input
                id={mfaCodeId}
                type="text"
                autoComplete="one-time-code"
                disabled={submitting}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.currentTarget.value)}
                data-testid="step-up-mfa-code"
              />
            </div>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <Button
              ref={cancelRef}
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={onCancel}
              data-testid="step-up-cancel"
            >
              <span>Cancel</span>
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={confirmDisabled}
              data-testid="step-up-confirm"
            >
              <span>{submitting ? 'Confirming…' : 'Confirm'}</span>
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
