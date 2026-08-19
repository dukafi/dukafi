/**
 * GeneralSection — site-level metadata.
 *
 * Fields: site name, meta title, meta description, language, favicon (picked
 * from the CMS media library — the same modal Content / Site property
 * controls use). All changes are persisted immediately to the Zustand store
 * and ultimately to the CMS draft via the autosave pipeline.
 *
 * Inputs use onBlur + onKeyDown(Enter) so intermediate keystrokes don't
 * push undo-history entries on every keystroke (performance pattern). The
 * favicon doesn't have intermediate states (single click → commit), so it
 * skips that pattern.
 */
import { Suspense, lazy, useState } from 'react'
import { useSiteSettingsController } from '../useSiteSettingsController'
import { useAsyncResource } from '@admin/lib/useAsyncResource'
import { Input, Textarea } from '@ui/components/Input'
import { Button } from '@ui/components/Button'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import {
  listCmsMediaAssets,
  type CmsMediaAsset,
} from '@core/persistence/cmsMedia'
import { blurHashToDataUrl, pickVariantUrl } from '@admin/pages/media/utils/variants'
import s from '../SettingsModal.module.css'

// Lazy-load the media picker modal so the Settings modal opens quickly even
// when the Media-page module graph (folders / canvas / viewer) hasn't been
// loaded yet. The Settings modal is the only entry point that mounts this
// picker outside the property panel — paying the ~10 KB price only when the
// favicon row is touched keeps Settings cheap to open.
const MediaPickerModal = lazy(() =>
  import('@admin/pages/media/components/MediaPickerModal/MediaPickerModal').then(
    (m) => ({ default: m.MediaPickerModal }),
  ),
)

export function GeneralSection() {
  const { site, error, updateSiteName, updateSiteSettings } = useSiteSettingsController()

  if (error) {
    return <p className={s.sectionDescription} role="alert">{error}</p>
  }

  if (!site) {
    return <SkeletonBlock minHeight={200} ariaLabel="Loading site settings" />
  }

  const { settings } = site

  return (
    <div>
      <p className={s.sectionDescription}>
        Site name, plus fallback title and description for pages that have not
        set their own SEO in Page settings. Product and collection URLs use
        the catalogue name instead of this title.
      </p>

      {/* ── Site name ─────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-proj-name" className={s.label}>
          Site Name
        </label>
        <Input
          id="gen-proj-name"
          type="text"
          defaultValue={site.name}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) updateSiteName(v)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Meta Title ────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-meta-title" className={s.label}>
          Meta Title
        </label>
        <Input
          id="gen-meta-title"
          type="text"
          defaultValue={settings.metaTitle ?? ''}
          placeholder="My Website"
          onBlur={(e) =>
            updateSiteSettings({ metaTitle: e.target.value.trim() || undefined })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Meta Description ──────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-meta-desc" className={s.label}>
          Meta Description
        </label>
        <Textarea
          id="gen-meta-desc"
          defaultValue={settings.metaDescription ?? ''}
          placeholder="A short description of your website."
          rows={3}
          onBlur={(e) =>
            updateSiteSettings({ metaDescription: e.target.value.trim() || undefined })
          }
        />
      </div>

      {/* ── Language ──────────────────────────────────────────────────────── */}
      <div className={s.genFieldRow}>
        <label htmlFor="gen-lang" className={s.label}>
          Language
        </label>
        <Input
          id="gen-lang"
          type="text"
          defaultValue={settings.language ?? 'en'}
          placeholder="en"
          onBlur={(e) =>
            updateSiteSettings({ language: e.target.value.trim() || 'en' })
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      {/* ── Favicon ───────────────────────────────────────────────────────── */}
      <FaviconField
        currentValue={settings.faviconUrl ?? ''}
        onChange={(next) =>
          updateSiteSettings({ faviconUrl: next.trim() || undefined })
        }
      />

      <LibraryImageField
        label="Default share image"
        emptyLabel="No share image selected"
        browseLabel="Browse library…"
        changeLabel="Change share image"
        currentValue={settings.ogImageUrl ?? ''}
        onChange={(next) =>
          updateSiteSettings({ ogImageUrl: next.trim() || undefined })
        }
      />
      <p className={s.sectionDescription} style={{ marginTop: 0 }}>
        og:image for pages that have not picked their own. Product pages use
        the product image instead — pick that on the product.
      </p>
    </div>
  )
}

interface FaviconFieldProps {
  currentValue: string
  onChange: (next: string) => void
}

/**
 * Library-only favicon picker. Mirrors the property-panel
 * `MediaLibraryControl` "library" mode but without the URL-mode toggle:
 * the favicon always points at an asset hosted by the CMS so the file
 * lives next to all other site uploads, gets the same backup / replace /
 * sharing semantics, and never depends on a third-party host.
 */
function FaviconField({ currentValue, onChange }: FaviconFieldProps) {
  return (
    <LibraryImageField
      label="Favicon"
      emptyLabel="No favicon selected"
      browseLabel="Browse library…"
      changeLabel="Change favicon"
      currentValue={currentValue}
      onChange={onChange}
    />
  )
}

interface LibraryImageFieldProps {
  label: string
  emptyLabel: string
  browseLabel: string
  changeLabel: string
  currentValue: string
  onChange: (next: string) => void
}

function LibraryImageField({
  label, emptyLabel, browseLabel, changeLabel, currentValue, onChange,
}: LibraryImageFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: cmsAssets, error } = useAsyncResource<CmsMediaAsset[]>(
    () => listCmsMediaAssets(),
    [],
    { fallbackError: 'Unable to load media library' },
  )
  const libraryError = error === 'Unauthorized' ? 'Sign in again to use CMS media.' : error
  const [pickedAsset, setPickedAsset] = useState<CmsMediaAsset | null>(null)
  const currentAsset =
    (cmsAssets ?? []).find((asset) => asset.publicPath === currentValue) ??
    (pickedAsset?.publicPath === currentValue ? pickedAsset : null)

  return (
    <div className={s.genFieldRow}>
      <span className={s.label}>{label}</span>
      <FaviconPreview asset={currentAsset} currentValue={currentValue} emptyLabel={emptyLabel} />
      <div className={s.faviconActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPickerOpen(true)}
          aria-label={`${browseLabel} for ${label}`}
        >
          <ImagesSolidIcon size={13} />
          <span>{currentValue ? changeLabel : browseLabel}</span>
        </Button>
        {currentValue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            aria-label={`Clear ${label}`}
          >
            Clear
          </Button>
        )}
      </div>
      {libraryError && (
        <p className={s.faviconStatus} role="alert">{libraryError}</p>
      )}
      {pickerOpen && (
        <Suspense fallback={null}>
          <MediaPickerModal
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            mediaKind="image"
            currentValue={currentValue || null}
            onPick={(asset) => {
              setPickedAsset(asset)
              onChange(asset.publicPath)
              setPickerOpen(false)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

interface FaviconPreviewProps {
  asset: CmsMediaAsset | null
  currentValue: string
  emptyLabel: string
}

function FaviconPreview({ asset, currentValue, emptyLabel }: FaviconPreviewProps) {
  if (!asset && !currentValue) {
    return (
      <div className={s.faviconEmpty}>
        <span className={s.faviconEmptyIcon} aria-hidden="true">
          <ImagesSolidIcon size={18} />
        </span>
        <span>{emptyLabel}</span>
      </div>
    )
  }

  if (!asset) {
    const filename = currentValue.split('/').pop() ?? currentValue
    return (
      <div className={s.faviconCurrent}>
        <span className={s.faviconThumb} aria-hidden="true">
          <ImagesSolidIcon size={18} />
        </span>
        <span className={s.faviconMeta}>
          <span className={s.faviconName}>{filename}</span>
          <span className={s.faviconSub}>Saved path</span>
        </span>
      </div>
    )
  }

  const thumbUrl = pickVariantUrl(asset, 48)
  const blurUrl = blurHashToDataUrl(asset.blurHash)
  const thumbStyle = blurUrl
    ? ({ backgroundImage: `url(${blurUrl})`, backgroundSize: 'cover' } as React.CSSProperties)
    : undefined
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null
  const subParts = [asset.mimeType, dimensions].filter(Boolean).join(' · ')

  return (
    <div className={s.faviconCurrent}>
      <span className={s.faviconThumb} aria-hidden="true" style={thumbStyle}>
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <ImagesSolidIcon size={18} />
        )}
      </span>
      <span className={s.faviconMeta}>
        <span className={s.faviconName}>{asset.filename}</span>
        {subParts && <span className={s.faviconSub}>{subParts}</span>}
      </span>
    </div>
  )
}
