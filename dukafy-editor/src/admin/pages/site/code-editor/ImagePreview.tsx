/**
 * ImagePreview — renders asset files inside the CodeEditor panel.
 *
 * Amendment #613 §A.2:
 * - Image assets (MIME image/*): renders <img> with a data URL derived from
 *   the stored base64 payload.
 * - Non-image assets (fonts, video, audio, etc.): shows a "Binary file" placeholder.
 *
 * Accessibility:
 * - <img> has alt="" (empty string, not missing) — the image is decorative
 *   in this context; the metadata footer already conveys filename/type.
 * - aria-label="Image preview: {filename}" on the container element.
 *
 * @see Amendment #613 §A.2 — image preview spec
 * @see Constraint #402 — no inline styles, no Tailwind
 * @see Guideline #376 — achromatic palette
 */

import type { SiteFile } from '@core/files/schemas'
import styles from './imagePreview.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format bytes to a human-readable string (e.g. "128 KB", "3.2 MB"). */
function formatSize(base64: string): string {
  // base64 encodes ~4/3 bytes; actual byte size:
  const bytes = Math.round((base64.length * 3) / 4)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// ImagePreview
// ---------------------------------------------------------------------------

interface ImagePreviewProps {
  file: SiteFile
}

export function ImagePreview({ file }: ImagePreviewProps) {
  const blob = file.blob

  // ── Non-image asset: show binary placeholder ─────────────────────────────
  if (!blob || !blob.mimeType.startsWith('image/')) {
    const filename = file.path.split('/').pop() ?? file.path
    const sizeStr = blob ? formatSize(blob.base64) : 'unknown size'
    const mimeStr = blob?.mimeType ?? 'unknown MIME type'

    return (
      <div className={styles.binaryPlaceholder}>
        <p className={styles.binaryTitle}>Binary file — no preview available</p>
        <p className={styles.binaryMeta}>{filename}</p>
        <p className={styles.binaryMeta}>{sizeStr} · {mimeStr}</p>
        <p className={styles.binaryHint}>Drag onto canvas to use this asset.</p>
      </div>
    )
  }

  // ── Image asset: render with object URL ──────────────────────────────────
  return <ImageRenderer file={file} blob={blob} />
}

// ---------------------------------------------------------------------------
// ImageRenderer — separated so the useEffect hook only runs for image assets
// ---------------------------------------------------------------------------

interface ImageRendererProps {
  file: SiteFile
  blob: { mimeType: string; base64: string }
}

function ImageRenderer({ file, blob }: ImageRendererProps) {
  const filename = file.path.split('/').pop() ?? file.path
  const sizeStr = formatSize(blob.base64)
  const previewUrl = `data:${blob.mimeType};base64,${blob.base64}`

  return (
    <div
      className={styles.previewContainer}
      aria-label={`Image preview: ${filename}`}
    >
      <img
        src={previewUrl}
        alt=""
        className={styles.previewImage}
      />
      <div className={styles.metaFooter}>
        <span className={styles.metaName}>{filename}</span>
        <span className={styles.metaSep}>·</span>
        <span>{sizeStr}</span>
        <span className={styles.metaSep}>·</span>
        <span>{blob.mimeType}</span>
      </div>
    </div>
  )
}
