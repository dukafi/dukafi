import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Page } from '@core/page-tree'
import {
  normalizePageSlug,
  pageSlugDuplicateError,
  pageSlugError,
} from '@core/page-tree'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import styles from '../../../shared/dialogs/SiteCreateDialog/SiteCreateDialog.module.css'
import { getErrorMessage } from '@core/utils/errorMessage'

export interface ExplorerRenamePayload {
  value: string
  slug?: string
}

interface ExplorerRenameDialogProps {
  title: string
  fieldLabel: 'Name' | 'Path'
  initialValue: string
  pages?: Page[]
  pageId?: string
  initialSlug?: string
  onCancel: () => void
  onRename: (payload: ExplorerRenamePayload) => void | Promise<void>
}

const EMPTY_PAGES: Page[] = []

function errorMessage(err: unknown) {
  return getErrorMessage(err, 'Unable to rename item').replace(/^\[[^\]]+\]\s*/, '')
}

export function ExplorerRenameDialog({
  title,
  fieldLabel,
  initialValue,
  pages = EMPTY_PAGES,
  pageId,
  initialSlug,
  onCancel,
  onRename,
}: ExplorerRenameDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [slug, setSlug] = useState(initialSlug ?? '')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const valueInputId = useId()
  const slugInputId = useId()
  const trimmedValue = value.trim()
  const isPage = initialSlug !== undefined
  const pageSlug = normalizePageSlug(slug)
  const slugValidation = isPage
    ? pageSlugError(pageSlug) || pageSlugDuplicateError(pageSlug, pages, pageId)
    : null

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmedValue || slugValidation) return

    try {
      await onRename(isPage ? { value: trimmedValue, slug: pageSlug } : { value: trimmedValue })
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
            form="explorer-rename-form"
            disabled={!trimmedValue || Boolean(slugValidation)}
          >
            Save
          </Button>
        </>
      }
    >
      <form id="explorer-rename-form" className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor={valueInputId} className={styles.label}>{fieldLabel}</label>
          <Input
            id={valueInputId}
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

        {isPage && (
          <div className={styles.field}>
            <label htmlFor={slugInputId} className={styles.label}>Slug</label>
            <Input
              id={slugInputId}
              fieldSize="sm"
              value={slug}
              onChange={(event) => {
                setSlug(normalizePageSlug(event.target.value))
                setSubmitError(null)
              }}
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(slugValidation)}
              aria-describedby={slugValidation ? 'explorer-rename-slug-error' : undefined}
            />
            {slugValidation && (
              <p id="explorer-rename-slug-error" role="alert" className={styles.errorText}>
                {slugValidation}
              </p>
            )}
          </div>
        )}

        {submitError && (
          <p role="alert" className={styles.errorText}>
            {submitError}
          </p>
        )}
      </form>
    </Dialog>
  )
}
