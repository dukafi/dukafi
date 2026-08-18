import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { Card } from '@ui/components/Card'
import { Checkbox } from '@ui/components/Checkbox'
import { Dialog } from '@ui/components/Dialog'
import { FileUpload } from '@ui/components/FileUpload'
import { getErrorMessage } from '@core/utils/errorMessage'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { commerceApi, themeApi } from '../api'
import type { CommerceData } from '../hooks/useCommerceData'
import type { ThemeInspect } from '../types'
import { EXPORT_DEFAULTS, ThemeApplyForm } from './ThemeApplyForm'
import styles from '../DashboardPage.module.css'

const EXPORT_ROWS: Array<{ key: string; label: string }> = [
  { key: 'media', label: 'Media (as URLs, not files)' },
  { key: 'design', label: 'Design tokens and classes' },
  { key: 'pages', label: 'Pages and partials' },
  { key: 'templates', label: 'Templates' },
  { key: 'tables', label: 'CMS tables and rows' },
  { key: 'forms', label: 'Forms' },
  { key: 'products', label: 'Products and collections' },
  { key: 'reviews', label: 'Reviews' },
]

export function ImportSection({ data }: { data: CommerceData }) {
  const { refresh } = data
  const [csvBusy, setCsvBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [include, setInclude] = useState(EXPORT_DEFAULTS)
  const [inspect, setInspect] = useState<{ payload: ThemeInspect; file: File } | null>(null)

  async function handleCsv(file: File) {
    setCsvBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await commerceApi.importCsv(file)
      setNotice(`Imported ${result.products} product${result.products === 1 ? '' : 's'} and ${result.variants} variant${result.variants === 1 ? '' : 's'}.`)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Import failed'))
    } finally {
      setCsvBusy(false)
    }
  }

  async function handleExport() {
    setExportBusy(true)
    setError(null)
    try {
      const { blob, filename } = await themeApi.exportTheme(include)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      setExportOpen(false)
      setNotice('Theme exported. Images are URLs — keep the source store running when you import.')
    } catch (err) {
      setError(getErrorMessage(err, 'Could not export the theme'))
    } finally {
      setExportBusy(false)
    }
  }

  async function handleThemeFile(file: File) {
    setError(null)
    setNotice(null)
    try {
      const payload = await themeApi.inspectFile(file)
      setInspect({ payload, file })
    } catch (err) {
      setError(getErrorMessage(err, 'Could not read that theme'))
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Import</h2>
          <p>CSV for a catalogue, or a theme for the whole store — pages, tables, sample products, and media URLs.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
          <SaveSolidIcon size={14} aria-hidden="true" />
          <span>Export theme</span>
        </Button>
      </div>

      {notice && <p className={styles.connectionResultSuccess} role="status">{notice}</p>}
      {error && <p className={styles.connectionResultError} role="alert">{error}</p>}

      <Card padding={32} className={styles.importCard}>
        <span className={styles.heroIcon}><CloudUploadSolidIcon size={28} aria-hidden="true" /></span>
        <div>
          <h3>Import a theme</h3>
          <p>
            A theme archive has no image files. This browser downloads them from the source store
            (even localhost) and uploads them here first.
          </p>
        </div>
        <FileUpload
          accept=".gz,.tar.gz,application/gzip"
          buttonProps={{ variant: 'primary', size: 'sm' }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void handleThemeFile(file)
          }}
        >
          <CloudUploadSolidIcon size={14} aria-hidden="true" />
          <span>Choose theme file</span>
        </FileUpload>
      </Card>

      <Card padding={32} className={styles.importCard}>
        <span className={styles.heroIcon}><CloudUploadSolidIcon size={28} aria-hidden="true" /></span>
        <div>
          <h3>Import products from CSV</h3>
          <p>
            Each row becomes a product variant; rows sharing a product slug are grouped onto the same product.
            Existing products are matched by slug and updated in place.
          </p>
        </div>
        <FileUpload
          accept=".csv,text/csv"
          buttonProps={{ variant: 'primary', size: 'sm', disabled: csvBusy }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void handleCsv(file)
          }}
        >
          <CloudUploadSolidIcon size={14} aria-hidden="true" />
          <span>{csvBusy ? 'Importing…' : 'Choose CSV file'}</span>
        </FileUpload>
      </Card>

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export theme"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setExportOpen(false)}>
              <span>Cancel</span>
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => void handleExport()} disabled={exportBusy}>
              <span>{exportBusy ? 'Exporting…' : 'Download'}</span>
            </Button>
          </>
        }
      >
        <p>Everything is included by default. Images are stored as URLs of this store, not as files.</p>
        <ul className={styles.memberList}>
          {EXPORT_ROWS.map((row) => (
            <li key={row.key}>
              <label className={styles.checkboxRow}>
                <Checkbox
                  checked={include[row.key] !== false}
                  onCheckedChange={(checked) => setInclude((current) => ({ ...current, [row.key]: checked }))}
                />
                <span>{row.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={inspect !== null}
        onClose={() => setInspect(null)}
        title={inspect ? `Import ${inspect.payload.theme.name}` : 'Import theme'}
        size="lg"
      >
        {inspect && (
          <ThemeApplyForm
            inspect={inspect.payload}
            file={inspect.file}
            onCancel={() => setInspect(null)}
            onDone={(summary) => {
              setInspect(null)
              setNotice(summary)
              void refresh()
            }}
          />
        )}
      </Dialog>
    </div>
  )
}
