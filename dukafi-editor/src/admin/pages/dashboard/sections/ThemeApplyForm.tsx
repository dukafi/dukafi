/**
 * Shared apply wizard: toggles with counts, copy media in the browser, then
 * apply the archive. Used from Import and from the post-setup default prompt.
 */
import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { getErrorMessage } from '@core/utils/errorMessage'
import { updateCmsMediaAsset, uploadCmsMediaAsset } from '@core/persistence/cmsMedia'
import { themeApi } from '../api'
import type { ThemeApplyOptions, ThemeInspect, ThemeMediaRef } from '../types'
import styles from '../DashboardPage.module.css'

export const IMPORT_DEFAULTS: ThemeApplyOptions = {
  overridePages: true,
  tables: true,
  forms: true,
  products: true,
  reviews: true,
  design: true,
  pages: true,
  templates: true,
}

export const EXPORT_DEFAULTS: Record<string, boolean> = {
  media: true,
  design: true,
  pages: true,
  templates: true,
  tables: true,
  forms: true,
  products: true,
  reviews: true,
}

const IMPORT_ROWS: Array<{ key: keyof ThemeApplyOptions; label: string; countKey: string }> = [
  { key: 'pages', label: 'Override pages', countKey: 'pages' },
  { key: 'templates', label: 'Templates', countKey: 'templates' },
  { key: 'tables', label: 'Create CMS tables if they do not exist', countKey: 'tables' },
  { key: 'forms', label: 'Create forms if they do not exist', countKey: 'forms' },
  { key: 'products', label: 'Create products and collections', countKey: 'products' },
  { key: 'reviews', label: 'Reviews', countKey: 'reviews' },
  { key: 'design', label: 'Design tokens and classes', countKey: 'design' },
]

function countLabel(contents: ThemeInspect['theme']['contents'], key: string): string {
  if (key === 'design') return 'shell'
  const value = contents[key as keyof typeof contents]
  if (key === 'products') {
    return `${contents.products ?? 0} products, ${contents.collections ?? 0} collections`
  }
  if (key === 'pages') {
    return `${contents.pages ?? 0} pages, ${contents.partials ?? 0} partials`
  }
  return String(value ?? 0)
}

async function copyMedia(media: ThemeMediaRef[], onProgress: (done: number, failed: number) => void) {
  const byId: Record<string, number> = {}
  const byPath: Record<string, string> = {}
  let failed = 0

  for (let index = 0; index < media.length; index += 1) {
    const item = media[index]
    try {
      const response = await fetch(item.url, { mode: 'cors' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const file = new File([blob], item.filename || 'upload', { type: item.mimeType || blob.type || 'application/octet-stream' })
      const uploaded = await uploadCmsMediaAsset(file)
      if (item.altText || item.title || item.caption || item.tags.length) {
        await updateCmsMediaAsset(uploaded.id, {
          altText: item.altText,
          title: item.title,
          caption: item.caption,
          tags: item.tags,
        })
      }
      byId[String(item.id)] = Number(uploaded.id)
      byPath[item.path] = uploaded.publicPath
    } catch {
      failed += 1
    }
    onProgress(index + 1, failed)
  }

  return { byId, byPath, failed }
}

interface ThemeApplyFormProps {
  inspect: ThemeInspect
  file?: File
  onDone: (summary: string) => void
  onCancel: () => void
}

export function ThemeApplyForm({ inspect, file, onDone, onCancel }: ThemeApplyFormProps) {
  const [options, setOptions] = useState<ThemeApplyOptions>(IMPORT_DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const contents = inspect.theme.contents
  const mediaCount = inspect.media.length

  async function handleApply() {
    setBusy(true)
    setError(null)
    try {
      setProgress(mediaCount ? `Copying media (0 of ${mediaCount})…` : 'Applying theme…')
      const remap = mediaCount
        ? await copyMedia(inspect.media, (done, failed) => {
            setProgress(`Copying media (${done} of ${mediaCount}${failed ? `, ${failed} missed` : ''})…`)
          })
        : { byId: {}, byPath: {}, failed: 0 }
      setProgress('Applying pages and catalogue…')
      const result = await themeApi.applyTheme({
        file,
        archive: inspect.archive,
        remap: { byId: remap.byId, byPath: remap.byPath },
        options,
      })
      const missed = remap.failed ? ` ${remap.failed} image${remap.failed === 1 ? '' : 's'} could not be copied — is the source store running?` : ''
      onDone(`${result.note}${missed}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not apply the theme'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className={styles.dialogForm}>
      <p>
        {inspect.theme.name}
        {inspect.theme.sourceOrigin ? ` from ${inspect.theme.sourceOrigin}` : ''}.
        Media is copied in this browser first, then everything you leave checked is applied.
      </p>
      <ul className={styles.memberList}>
        {IMPORT_ROWS.map((row) => (
          <li key={row.key}>
            <label className={styles.checkboxRow}>
              <Checkbox
                checked={options[row.key]}
                onCheckedChange={(checked) => setOptions((current) => ({ ...current, [row.key]: checked }))}
                disabled={busy}
              />
              <span>{row.label} ({countLabel(contents, row.countKey)})</span>
            </label>
          </li>
        ))}
      </ul>
      <p className={styles.themeMediaNote}>Media ({mediaCount}) always runs first.</p>
      {progress && <p role="status">{progress}</p>}
      {error && <p className={styles.connectionResultError} role="alert">{error}</p>}
      <div className={styles.themeActions}>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          <span>Cancel</span>
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => void handleApply()} disabled={busy}>
          <span>{busy ? 'Importing…' : 'Import theme'}</span>
        </Button>
      </div>
    </div>
  )
}
