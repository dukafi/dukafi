/**
 * Commerce → Import. Bulk-loads products and variants from a CSV — the
 * merchant-onboarding path described in `docs/csv-import.md`.
 */
import { useState } from 'react'
import { Card } from '@ui/components/Card'
import { FileUpload } from '@ui/components/FileUpload'
import { getErrorMessage } from '@core/utils/errorMessage'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { commerceApi } from '../api'
import type { CommerceData } from '../hooks/useCommerceData'
import styles from '../CommercePage.module.css'

export function ImportSection({ data }: { data: CommerceData }) {
  const { refresh } = data
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await commerceApi.importCsv(file)
      setNotice(`Imported ${result.products} product${result.products === 1 ? '' : 's'} and ${result.variants} variant${result.variants === 1 ? '' : 's'}.`)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Import failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Import</h2>
          <p>Bulk-load products and variants from a CSV file — the fastest way to seed a new catalog.</p>
        </div>
      </div>

      <Card padding={32} className={styles.importCard}>
        <span className={styles.settingsHeroIcon}><CloudUploadSolidIcon size={28} aria-hidden="true" /></span>
        <div>
          <h3>Import products from CSV</h3>
          <p>
            Each row becomes a product variant; rows sharing a product slug are grouped onto the same product.
            Existing products are matched by slug and updated in place.
          </p>
        </div>
        <FileUpload
          accept=".csv,text/csv"
          buttonProps={{ variant: 'primary', size: 'sm', disabled: busy }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void handleFile(file)
          }}
        >
          <CloudUploadSolidIcon size={14} aria-hidden="true" />
          <span>{busy ? 'Importing…' : 'Choose CSV file'}</span>
        </FileUpload>
        {notice && <p className={styles.connectionResultSuccess} role="status">{notice}</p>}
        {error && <p className={styles.connectionResultError} role="alert">{error}</p>}
      </Card>
    </div>
  )
}
