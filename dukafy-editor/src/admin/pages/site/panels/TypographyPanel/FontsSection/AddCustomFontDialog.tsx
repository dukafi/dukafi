/**
 * AddCustomFontDialog — register a custom font from files in the media library.
 *
 * Custom fonts are stored in the media library (the same place Super Import
 * lands imported font binaries), so this dialog PICKS from the library rather
 * than forcing a fresh upload:
 *
 *   1. Name the family (free text, deduped against installed families).
 *   2. Pick one or more font assets (`font/*`) already in the media library.
 *      Each picked file gets a weight + italic variant (a font file is one
 *      `(weight, style)` face), defaulted from its filename.
 *   3. Need a file that isn't in the library yet? "Upload font file" runs it
 *      through the media route (`uploadCmsMediaAsset`) — magic-byte sniffed,
 *      server-chosen extension — then it appears in the list, auto-selected.
 *   4. A live preview renders the family + a pangram in the picked faces via a
 *      transient `@font-face` block — editor session only, never published.
 *   5. Install posts `{ family, files: [{ mediaAssetId, variant }] }` to
 *      `/fonts/custom`; the server resolves each asset to a trusted
 *      `(path, format)` and returns a `FontEntry` to merge into site settings.
 *
 * The dialog composes the shared Dialog primitive; state stays local. The
 * parent (`FontsSection`) mounts it when open and passes `onInstalled(entry)`.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import {
  listCmsMediaAssets,
  uploadCmsMediaAsset,
  type CmsMediaAsset,
} from '@core/persistence/cmsMedia'
import { registerCustomFont } from '@core/persistence/cmsFonts'
import type { FontEntry } from '@core/fonts'
import { formatVariant, parseVariant } from '@core/fonts'
import styles from './FontsSection.module.css'
import { getErrorMessage } from '@core/utils/errorMessage'

interface AddCustomFontDialogProps {
  /** Families already installed (case-insensitive) — blocks duplicate names. */
  installedFamilies: ReadonlySet<string>
  /**
   * When set, the dialog opens in edit mode pre-filled with the entry's family
   * name and its picked media files / variants. Saving re-registers the family
   * and the caller replaces the existing entry.
   */
  editEntry?: FontEntry
  onCancel: () => void
  onInstalled: (entry: FontEntry) => void
}

/** Accepted upload extensions, mirrored in the `<input accept>` attribute. */
const ACCEPT_EXTENSIONS = '.woff2,.woff,.ttf,.otf'

const WEIGHT_OPTIONS = [
  { value: '100', label: 'Thin 100' },
  { value: '200', label: 'ExtraLight 200' },
  { value: '300', label: 'Light 300' },
  { value: '400', label: 'Regular 400' },
  { value: '500', label: 'Medium 500' },
  { value: '600', label: 'SemiBold 600' },
  { value: '700', label: 'Bold 700' },
  { value: '800', label: 'ExtraBold 800' },
  { value: '900', label: 'Black 900' },
]

const DEFAULT_PREVIEW_TEXT = 'The quick brown fox jumps over the lazy dog'

/** The chosen variant for one selected media asset. */
interface PickedVariant {
  weight: number
  italic: boolean
}

/**
 * Guess a sensible (weight, italic) default from a font filename so the user
 * usually doesn't have to touch the pickers. Falls back to Regular 400.
 */
function guessVariantFromName(filename: string): PickedVariant {
  const lower = filename.toLowerCase()
  const italic = /italic|oblique/.test(lower)
  let weight = 400
  if (/thin|hairline/.test(lower)) weight = 100
  else if (/extralight|ultralight/.test(lower)) weight = 200
  else if (/light/.test(lower)) weight = 300
  else if (/medium/.test(lower)) weight = 500
  else if (/semibold|demibold/.test(lower)) weight = 600
  else if (/extrabold|ultrabold/.test(lower)) weight = 800
  else if (/black|heavy/.test(lower)) weight = 900
  else if (/bold/.test(lower)) weight = 700
  return { weight, italic }
}

function cssString(value: string): string {
  return JSON.stringify(value)
}

function assetPreviewFamily(baseFamily: string, assetId: string): string {
  const suffix = assetId.replace(/[^a-zA-Z0-9]/g, '')
  return `${baseFamily}Asset${suffix || 'File'}`
}

function displayFontFilename(filename: string): string {
  return filename.replace(/\.(woff2?|ttf|otf)$/i, '')
}

function variantLabel(variant: PickedVariant): string {
  const option = WEIGHT_OPTIONS.find((item) => item.value === String(variant.weight))
  const label = option?.label ?? `Weight ${variant.weight}`
  return variant.italic ? `${label} Italic` : label
}

/**
 * Seed the picked-variant map from an entry being edited: each media-backed
 * file becomes one selected `(weight, italic)` face keyed by its asset id.
 * Files without a `mediaAssetId` (none, for custom fonts) are skipped.
 */
function pickedFromEntry(entry: FontEntry | undefined): Record<string, PickedVariant> {
  if (!entry) return {}
  const init: Record<string, PickedVariant> = {}
  for (const file of entry.files) {
    if (!file.mediaAssetId) continue
    init[file.mediaAssetId] = parseVariant(file.variant) ?? { weight: 400, italic: false }
  }
  return init
}

/**
 * Remove or add `asset` from the picked-variant map. Extracted to module level
 * so the React Compiler doesn't attempt to compile the computed property key
 * destructuring `{ [asset.id]: _removed, ...rest }` inside the callback
 * (BuildHIR currently bails on UpdateExpressions captured within lambdas).
 */
function toggleFontAsset(
  asset: CmsMediaAsset,
  setPicked: (updater: (prev: Record<string, PickedVariant>) => Record<string, PickedVariant>) => void,
): void {
  setPicked((prev) => {
    if (prev[asset.id]) {
      const { [asset.id]: _removed, ...rest } = prev
      return rest
    }
    return { ...prev, [asset.id]: guessVariantFromName(asset.filename) }
  })
}

/**
 * Upload one or more font files, auto-select them in the picker, and clear the
 * uploading flag when done. Extracted to module level so the React Compiler
 * doesn't encounter the .finally() promise chain inside a component body.
 * Semantics are identical to the original .then/.catch/.finally chain.
 */
async function uploadPickedFontFiles(
  files: File[],
  setUploading: (v: boolean) => void,
  setUploadError: (v: string | null) => void,
  setAssets: (updater: (prev: CmsMediaAsset[] | null) => CmsMediaAsset[]) => void,
  setPicked: (updater: (prev: Record<string, PickedVariant>) => Record<string, PickedVariant>) => void,
): Promise<void> {
  setUploading(true)
  setUploadError(null)
  try {
    const uploaded = await Promise.all(files.map((file) => uploadCmsMediaAsset(file)))
    // Prepend the new assets and auto-select them with a filename guess.
    setAssets((prev) => [...uploaded, ...(prev ?? [])])
    setPicked((prev) => {
      const next = { ...prev }
      for (const asset of uploaded) next[asset.id] = guessVariantFromName(asset.filename)
      return next
    })
  } catch (err) {
    setUploadError(getErrorMessage(err, 'Font upload failed'))
  } finally {
    setUploading(false)
  }
}

async function installCustomFont(
  trimmedFamily: string,
  pickedIds: string[],
  picked: Record<string, PickedVariant>,
  setInstalling: (v: boolean) => void,
  setInstallError: (v: string | null) => void,
  onInstalled: (entry: FontEntry) => void,
): Promise<void> {
  setInstalling(true)
  setInstallError(null)
  try {
    const entry = await registerCustomFont({
      family: trimmedFamily,
      files: pickedIds.map((id) => ({
        mediaAssetId: id,
        variant: formatVariant(picked[id]),
      })),
    })
    onInstalled(entry)
  } catch (err) {
    setInstallError(getErrorMessage(err, 'Custom font install failed'))
  } finally {
    setInstalling(false)
  }
}

export function AddCustomFontDialog({
  installedFamilies,
  editEntry,
  onCancel,
  onInstalled,
}: AddCustomFontDialogProps) {
  const [family, setFamily] = useState(editEntry?.family ?? '')
  const [assets, setAssets] = useState<CmsMediaAsset[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // mediaAssetId → chosen variant. Presence in the map = selected.
  const [picked, setPicked] = useState<Record<string, PickedVariant>>(() => pickedFromEntry(editEntry))
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const trimmedFamily = family.trim()
  const familyTaken =
    trimmedFamily.length > 0 && installedFamilies.has(trimmedFamily.toLowerCase())

  // Stable, session-unique preview family so the transient @font-face can't
  // collide with a real installed family or another open dialog. `useId` is a
  // render-safe source of a unique token (no module counter, no ref reads).
  const previewFamily = `instaticCustomFontPreview${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const fontAssets = (assets ?? []).filter((a) => a.mimeType.startsWith('font/'))
  const pickedIds = Object.keys(picked)

  // Load the media library once on mount; we filter to font assets in render.
  useEffect(() => {
    let cancelled = false
    listCmsMediaAssets()
      .then((items) => {
        if (!cancelled) setAssets(items)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Failed to load media'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Inject transient @font-face rules for:
  //   - every media font asset as a one-file preview tile.
  //   - every picked asset as a face in the composed family preview.
  // Removed on unmount / change — never persisted, never published.
  useEffect(() => {
    const fontAssetsForPreview = (assets ?? []).filter((asset) => asset.mimeType.startsWith('font/'))
    const byId = new Map(fontAssetsForPreview.map((asset) => [asset.id, asset]))
    const assetFaces = fontAssetsForPreview.map((asset) => {
      const guessedVariant = guessVariantFromName(asset.filename)
      return `@font-face { font-family: ${cssString(assetPreviewFamily(previewFamily, asset.id))}; font-weight: 400; font-style: normal; font-display: swap; src: url(${cssString(asset.publicPath)}); }\n@font-face { font-family: ${cssString(assetPreviewFamily(previewFamily, asset.id))}; font-weight: ${guessedVariant.weight}; font-style: ${guessedVariant.italic ? 'italic' : 'normal'}; font-display: swap; src: url(${cssString(asset.publicPath)}); }`
    })
    const pickedFaces = Object.entries(picked)
      .flatMap(([id, variant]) => {
        const asset = byId.get(id)
        if (!asset) return []
        return [`@font-face { font-family: ${cssString(previewFamily)}; font-weight: ${variant.weight}; font-style: ${variant.italic ? 'italic' : 'normal'}; font-display: swap; src: url(${cssString(asset.publicPath)}); }`]
      })
    const faces = [...assetFaces, ...pickedFaces].join('\n')

    if (!faces) return
    const styleEl = document.createElement('style')
    styleEl.textContent = faces
    document.head.appendChild(styleEl)
    return () => {
      styleEl.remove()
    }
  }, [picked, assets, previewFamily])

  function updateVariant(id: string, patch: Partial<PickedVariant>) {
    setPicked((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
  }

  function handleUploadPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    if (fileInputRef.current) fileInputRef.current.value = ''
    void uploadPickedFontFiles(files, setUploading, setUploadError, setAssets, setPicked)
  }

  async function handleInstall() {
    if (installing) return
    if (!trimmedFamily || familyTaken || pickedIds.length === 0) return
    await installCustomFont(trimmedFamily, pickedIds, picked, setInstalling, setInstallError, onInstalled)
  }

  const canInstall =
    !installing && !uploading && trimmedFamily.length > 0 && !familyTaken && pickedIds.length > 0

  return (
    <Dialog
      open
      onClose={() => {
        if (!installing) onCancel()
      }}
      closeOnBackdrop={!installing}
      closeOnEscape={!installing}
      hideCloseButton={installing}
      title={editEntry ? `Edit custom font — ${editEntry.family}` : 'Add custom font'}
      size="xl"
      bodyClassName={styles.dialogBody}
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={installing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => { void handleInstall() }}
            disabled={!canInstall}
          >
            {installing ? (
              <>
                <LoaderIcon size={12} aria-hidden="true" /> {editEntry ? 'Saving…' : 'Installing…'}
              </>
            ) : (
              editEntry ? 'Save changes' : 'Install font'
            )}
          </Button>
        </>
      }
    >
      <div className={styles.dialogSection}>
        <label className={styles.dialogSectionTitle} htmlFor="custom-font-family">
          Font family name
        </label>
        <Input
          id="custom-font-family"
          fieldSize="sm"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          placeholder="e.g. Acme Grotesk"
          invalid={familyTaken}
          autoFocus
        />
        {familyTaken && (
          <p role="alert" className={styles.errorAlert}>
            A font named “{trimmedFamily}” is already installed.
          </p>
        )}
      </div>

      {/* Live preview in the picked faces (transient @font-face). */}
      {pickedIds.length > 0 && (
        <div className={styles.preview}>
          <div className={styles.previewMeta}>
            <span className={styles.previewFamilyName}>{trimmedFamily || 'Custom font'}</span>
            <span className={styles.previewCategory}>Custom</span>
          </div>
          <p
            className={styles.previewSample}
            style={{ fontFamily: `"${previewFamily}", system-ui, sans-serif` } as CSSProperties}
          >
            {DEFAULT_PREVIEW_TEXT}
          </p>
        </div>
      )}

      <div className={styles.dialogSection}>
        <div className={styles.dialogSectionHeader}>
          <h3 className={styles.dialogSectionTitle}>
            Font files from media ({pickedIds.length} selected)
          </h3>
          <Button
            variant="secondary"
            size="xs"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={installing || uploading}
          >
            {uploading ? (
              <>
                <LoaderIcon size={11} aria-hidden="true" /> Uploading…
              </>
            ) : (
              'Upload font file'
            )}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_EXTENSIONS}
          multiple
          hidden
          aria-label="Upload font files"
          onChange={(e) => handleUploadPicked(e.target.files)}
        />

        {uploadError && <p role="alert" className={styles.errorAlert}>{uploadError}</p>}

        {loadError ? (
          <p role="alert" className={styles.errorAlert}>{loadError}</p>
        ) : assets === null ? (
          <SkeletonBlock minHeight={120} ariaLabel="Loading media library" />
        ) : fontAssets.length === 0 ? (
          <p className={styles.pickerInfo}>
            No font files in your media library yet. Upload a .woff2, .woff, .ttf or .otf
            file to get started.
          </p>
        ) : (
          <ul className={styles.customFontList} aria-label="Font files in media library">
            {fontAssets.map((asset) => {
              const variant = picked[asset.id]
              const checked = variant != null
              const displayName = displayFontFilename(asset.filename)
              const italicInputId = `${assetPreviewFamily(previewFamily, asset.id)}Italic`
              const previewStyle = {
                fontFamily: `"${assetPreviewFamily(previewFamily, asset.id)}", system-ui, sans-serif`,
              } as CSSProperties
              return (
                <li
                  key={asset.id}
                  className={styles.customFontItem}
                  data-checked={checked ? 'true' : undefined}
                >
                  <label className={styles.customPickLabel}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleFontAsset(asset, setPicked)}
                      aria-label={`Select ${asset.filename}`}
                    />
                    <span className={styles.customFontFileText}>
                      <span className={styles.customFontPreviewName} style={previewStyle}>
                        {displayName}
                      </span>
                      <span className={styles.customFontMeta}>
                        {checked && variant
                          ? variantLabel(variant)
                          : `${asset.mimeType} · detected ${variantLabel(guessVariantFromName(asset.filename))}`}
                      </span>
                    </span>
                  </label>
                  {checked && variant && (
                    <div className={styles.customFileControls}>
                      <Select
                        fieldSize="sm"
                        options={WEIGHT_OPTIONS}
                        value={String(variant.weight)}
                        onChange={(e) => updateVariant(asset.id, { weight: Number(e.target.value) })}
                        aria-label={`Weight for ${asset.filename}`}
                      />
                      <label className={styles.customItalicToggle} htmlFor={italicInputId}>
                        <Checkbox
                          id={italicInputId}
                          checked={variant.italic}
                          onCheckedChange={(it) => updateVariant(asset.id, { italic: it })}
                          aria-label={`Italic for ${asset.filename}`}
                        />
                        Italic
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {installError && (
        <p role="alert" className={styles.errorAlert}>{installError}</p>
      )}
    </Dialog>
  )
}
