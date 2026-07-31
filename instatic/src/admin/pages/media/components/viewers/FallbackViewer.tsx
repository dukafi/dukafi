/**
 * FallbackViewer — anything we don't yet have a dedicated viewer for.
 *
 * Today the media library only accepts JPEG/PNG/GIF/WebP and MP4/WebM, so
 * the fallback is mostly a future-proofing safety net: if a row's MIME ever
 * falls outside both buckets (manually inserted, future upload pipeline, etc.)
 * we still render something useful instead of breaking the window.
 */
import { Button } from '@ui/components/Button'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { ExternalLinkSolidIcon } from 'pixel-art-icons/icons/external-link-solid'
import styles from './FallbackViewer.module.css'

interface FallbackViewerProps {
  publicPath: string
  filename: string
  mimeType: string
}

export function FallbackViewer({ publicPath, filename, mimeType }: FallbackViewerProps) {
  return (
    <div className={styles.root}>
      <ImagesSolidIcon size={48} />
      <p className={styles.title}>{filename}</p>
      <p className={styles.meta}>{mimeType || 'Unknown type'}</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => window.open(publicPath, '_blank', 'noopener,noreferrer')}
        aria-label={`Open ${filename} in a new tab`}
      >
        <ExternalLinkSolidIcon size={13} />
        <span>Open in new tab</span>
      </Button>
    </div>
  )
}
