import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import dialogStyles from '../../../../shared/dialogs/SiteCreateDialog/SiteCreateDialog.module.css'
import { slugFromTitle } from '@core/utils/slug'
import { getErrorMessage } from '@core/utils/errorMessage'

export interface ContentItemRenamePayload {
  title: string
  slug: string
}

interface ContentItemRenameDialogProps {
  title: string
  titleLabel: string
  initialTitle: string
  initialSlug: string
  onCancel: () => void
  onRename: (payload: ContentItemRenamePayload) => void | Promise<void>
}

function errorMessage(err: unknown) {
  return getErrorMessage(err, 'Unable to rename item').replace(/^\[[^\]]+\]\s*/, '')
}

const FORM_ID = 'content-item-rename-form'

export function ContentItemRenameDialog({
  title,
  titleLabel,
  initialTitle,
  initialSlug,
  onCancel,
  onRename,
}: ContentItemRenameDialogProps) {
  const [value, setValue] = useState(initialTitle)
  const [slug, setSlug] = useState(initialSlug)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleInputId = useId()
  const slugInputId = useId()
  const trimmedValue = value.trim()
  const normalizedSlug = slugFromTitle(slug || trimmedValue)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmedValue) return

    try {
      await onRename({ title: trimmedValue, slug: normalizedSlug })
    } catch (err) {
      setSubmitError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form={FORM_ID}
            disabled={!trimmedValue}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={dialogStyles.form} onSubmit={handleSubmit}>
        <div className={dialogStyles.field}>
          <label htmlFor={titleInputId} className={dialogStyles.label}>{titleLabel}</label>
          <Input
            id={titleInputId}
            ref={inputRef}
            fieldSize="sm"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setSubmitError(null)
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={dialogStyles.field}>
          <label htmlFor={slugInputId} className={dialogStyles.label}>Slug</label>
          <Input
            id={slugInputId}
            fieldSize="sm"
            value={slug}
            onChange={(event) => {
              setSlug(slugFromTitle(event.target.value))
              setSubmitError(null)
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {submitError && (
          <p role="alert" className={dialogStyles.errorText}>
            {submitError}
          </p>
        )}
      </form>
    </Dialog>
  )
}
