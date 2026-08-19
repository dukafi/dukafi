import { useEffect, useId, useRef, useState, type FormEvent, Suspense, lazy } from 'react'
import { Type } from '@core/utils/typeboxHelpers'
import { apiRequest } from '@core/http'
import { getErrorMessage } from '@core/utils/errorMessage'
import type { Page } from '@core/page-tree'
import {
  isHomePage,
  normalizePageSlug,
  pagePublicPath,
  pageSlugDuplicateError,
  pageSlugError,
} from '@core/page-tree'
import { copyStorefrontUrl } from '@admin/lib/storefrontUrl'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input, Textarea } from '@ui/components/Input'
import { Checkbox } from '@ui/components/Checkbox'
import { Select } from '@ui/components/Select'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { Copy2SolidIcon } from 'pixel-art-icons/icons/copy-2-solid'
import dialogStyles from '../SiteCreateDialog/SiteCreateDialog.module.css'

const MediaPickerModal = lazy(() =>
  import('@admin/pages/media/components/MediaPickerModal/MediaPickerModal').then(
    (m) => ({ default: m.MediaPickerModal }),
  ),
)

const AccessSchema = Type.Object({
  access: Type.String(),
  authRedirect: Type.Boolean(),
  signInPageSlug: Type.Union([Type.String(), Type.Null()]),
})

const ACCESS_OPTIONS = [
  { value: 'public', label: 'Anyone', textValue: 'Anyone' },
  { value: 'customer', label: 'Signed-in customers only', textValue: 'Signed-in customers only' },
]

export interface PageSettingsPayload {
  title: string
  slug: string
  seoTitle: string
  seoDescription: string
  ogImage: string
}

interface PageSettingsDialogProps {
  page: Page
  pages: Page[]
  onCancel: () => void
  onSave: (payload: PageSettingsPayload) => void
}

const FORM_ID = 'page-settings-form'

/**
 * Title + slug editor for a regular page. The site explorer's inline rename
 * only ever changes the title (`renamePage(id, title)` with no third arg
 * leaves the slug untouched) — this dialog is the one place a page's slug
 * can actually be changed after creation.
 *
 * Access is fetched and saved SEPARATELY from the page tree, through its own
 * endpoint. It is not document content: it decides which directory the page
 * bakes into and whether the storefront checks for a session before serving
 * it. Keeping it off the document also means a routine save of the canvas
 * can never change who is allowed to see the page.
 */
export function PageSettingsDialog({
  page,
  pages,
  onCancel,
  onSave,
}: PageSettingsDialogProps) {
  const [title, setTitle] = useState(page.title)
  const [slug, setSlug] = useState(page.slug)
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? '')
  const [ogImage, setOgImage] = useState(page.ogImage ?? '')
  const [ogPickerOpen, setOgPickerOpen] = useState(false)
  const [access, setAccess] = useState('public')
  const [authRedirect, setAuthRedirect] = useState(false)
  const [signInPageSlug, setSignInPageSlug] = useState<string | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  // What the server said when the dialog opened. Saving touches the access
  // endpoint only when one of these actually changed, so renaming a page
  // still works on a store where that endpoint is unreachable — and a
  // failure can only ever block a change the merchant actually asked for.
  const [loadedAccess, setLoadedAccess] = useState<{ access: string; authRedirect: boolean } | null>(null)
  const isHome = isHomePage(page)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleInputId = useId()
  const slugInputId = useId()
  const seoTitleInputId = useId()
  const seoDescriptionInputId = useId()
  const accessSelectId = useId()

  const trimmedTitle = title.trim()
  const normalizedSlug = normalizePageSlug(slug)
  const slugValidation = isHome
    ? null
    : pageSlugError(normalizedSlug) || pageSlugDuplicateError(normalizedSlug, pages, page.id)

  const saveDisabled = !trimmedTitle || Boolean(slugValidation)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  useEffect(() => {
    let cancelled = false
    void apiRequest(`/admin/api/cms/pages/${encodeURIComponent(page.id)}/access`, {
      schema: AccessSchema,
      fallbackMessage: 'Could not read this page’s access setting',
    })
      .then((result) => {
        if (cancelled) return
        setAccess(result.access)
        setAuthRedirect(result.authRedirect)
        setSignInPageSlug(result.signInPageSlug)
        setLoadedAccess({ access: result.access, authRedirect: result.authRedirect })
      })
      // Silent: a page whose access cannot be read is still worth renaming,
      // and the save below simply will not change it.
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [page.id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saveDisabled) return

    const accessChanged = loadedAccess !== null &&
      (loadedAccess.access !== access || loadedAccess.authRedirect !== authRedirect)

    if (accessChanged) {
      try {
        await apiRequest(`/admin/api/cms/pages/${encodeURIComponent(page.id)}/access`, {
          method: 'PATCH',
          body: { access, authRedirect },
          schema: AccessSchema,
          fallbackMessage: 'Could not save the access setting',
        })
      } catch (error) {
        // Reported rather than swallowed, and the dialog stays open: silently
        // leaving a page public when the merchant asked to gate it is the one
        // failure here that matters.
        setAccessError(getErrorMessage(error, 'Could not save the access setting'))
        return
      }
    }

    onSave({
      title: trimmedTitle,
      slug: isHome ? page.slug : normalizedSlug,
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
      ogImage: ogImage.trim(),
    })
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Page settings"
      size="md"
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
            disabled={saveDisabled}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={dialogStyles.form} onSubmit={(event) => void handleSubmit(event)}>
        <div className={dialogStyles.field}>
          <label htmlFor={titleInputId} className={dialogStyles.label}>Title</label>
          <Input
            id={titleInputId}
            ref={inputRef}
            fieldSize="sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={dialogStyles.field}>
          <label htmlFor={slugInputId} className={dialogStyles.label}>Slug</label>
          <Input
            id={slugInputId}
            fieldSize="sm"
            value={isHome ? page.slug : slug}
            onChange={(event) => setSlug(normalizePageSlug(event.target.value))}
            autoComplete="off"
            spellCheck={false}
            disabled={isHome}
            invalid={Boolean(slugValidation)}
          />
          {isHome ? (
            <p className={dialogStyles.label}>The homepage is always served at &ldquo;/&rdquo;.</p>
          ) : slugValidation ? (
            <p role="alert" className={dialogStyles.errorText}>{slugValidation}</p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyStorefrontUrl(pagePublicPath(isHome ? page.slug : normalizedSlug), 'Copied page URL')}
          >
            <Copy2SolidIcon size={13} aria-hidden="true" />
            <span>Copy page URL</span>
          </Button>
        </div>

        <div className={dialogStyles.field}>
          <label htmlFor={seoTitleInputId} className={dialogStyles.label}>SEO title</label>
          <Input
            id={seoTitleInputId}
            fieldSize="sm"
            value={seoTitle}
            onChange={(event) => setSeoTitle(event.target.value)}
            autoComplete="off"
            spellCheck
            placeholder={trimmedTitle || 'Title shown in search results'}
          />
          <p className={dialogStyles.label}>
            Unique to this page. Leave blank to use the page title. Not a list of keywords.
          </p>
        </div>

        <div className={dialogStyles.field}>
          <label htmlFor={seoDescriptionInputId} className={dialogStyles.label}>SEO description</label>
          <Textarea
            id={seoDescriptionInputId}
            fieldSize="sm"
            value={seoDescription}
            onChange={(event) => setSeoDescription(event.target.value)}
            rows={3}
            spellCheck
            placeholder="Short pitch for search results — what this page is, who it is for."
          />
        </div>

        <div className={dialogStyles.field}>
          <span className={dialogStyles.label}>Share image</span>
          <p className={dialogStyles.label}>
            og:image for this page. Product URLs pick an image on the product instead.
          </p>
          {ogImage ? (
            <p className={dialogStyles.label}>{ogImage.split('/').pop()}</p>
          ) : (
            <p className={dialogStyles.label}>Uses the site default, if one is set.</p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-s)' }}>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOgPickerOpen(true)}>
              <ImagesSolidIcon size={13} aria-hidden="true" />
              <span>{ogImage ? 'Change image' : 'Choose image'}</span>
            </Button>
            {ogImage ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setOgImage('')}>
                Clear
              </Button>
            ) : null}
          </div>
          {ogPickerOpen && (
            <Suspense fallback={null}>
              <MediaPickerModal
                open={ogPickerOpen}
                onClose={() => setOgPickerOpen(false)}
                mediaKind="image"
                currentValue={ogImage || null}
                onPick={(asset) => {
                  setOgImage(asset.publicPath)
                  setOgPickerOpen(false)
                }}
              />
            </Suspense>
          )}
        </div>

        <div className={dialogStyles.field}>
          <label htmlFor={accessSelectId} className={dialogStyles.label}>Who can see this</label>
          <Select
            id={accessSelectId}
            fieldSize="sm"
            value={access}
            options={ACCESS_OPTIONS}
            // A page cannot both require sign-in and be where people go to
            // sign in — that locks every customer out permanently.
            disabled={authRedirect}
            onChange={(event) => setAccess(event.target.value)}
          />
          {access === 'customer' && (
            <p className={dialogStyles.label}>
              {signInPageSlug
                ? `Signed-out visitors go to “${signInPageSlug}”. Publish to apply.`
                : 'No sign-in page is set yet, so this page will be a 404 for signed-out visitors.'}
            </p>
          )}
        </div>

        <div className={dialogStyles.field}>
          <label className={dialogStyles.label}>
            <Checkbox
              boxSize="sm"
              checked={authRedirect}
              onCheckedChange={(next) => {
                setAuthRedirect(next)
                // Becoming the sign-in page means being reachable, so the
                // gate comes off rather than the save being refused.
                if (next) setAccess('public')
              }}
            />{' '}
            Send signed-out visitors here
          </label>
          <p className={dialogStyles.label}>
            The store&rsquo;s sign-in page. Only one page can be it{signInPageSlug && !authRedirect ? ` — currently “${signInPageSlug}”` : ''}.
          </p>
        </div>

        {accessError && <p role="alert" className={dialogStyles.errorText}>{accessError}</p>}
      </form>
    </Dialog>
  )
}
