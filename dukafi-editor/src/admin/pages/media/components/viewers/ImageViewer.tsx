/**
 * ImageViewer — the viewer body for image assets.
 *
 * Renders the asset using a viewer-appropriate variant + BlurHash placeholder
 * so the viewer doesn't block on the full original. Pure preview surface —
 * editing (alt text, caption, tags, replace file, …) lives in the sidebar of
 * the enclosing MediaViewerWindow.
 */
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'
import { blurHashToDataUrl, buildVariantSrcset, pickVariantUrl } from '../../utils/variants'
import styles from './ImageViewer.module.css'

interface ImageViewerProps {
  asset: CmsMediaAsset
}

// Viewer preview area: ~600 CSS px wide inside the 880-px window minus the
// 300-px sidebar minus padding. The browser grabs the smallest variant ≥
// 600 (scaled by DPR), which is `w1024` on a 1× display and `w1600` on 2×.
const VIEWER_CSS_WIDTH = 600

export function ImageViewer({ asset }: ImageViewerProps) {
  const src = pickVariantUrl(asset, VIEWER_CSS_WIDTH)
  const srcset = buildVariantSrcset(asset)
  const blurHashUrl = blurHashToDataUrl(asset.blurHash)
  const surfaceStyle = blurHashUrl
    ? ({
        backgroundImage: `url(${blurHashUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } as React.CSSProperties)
    : undefined
  return (
    <div className={styles.root} style={surfaceStyle}>
      <img
        src={src}
        srcSet={srcset}
        sizes="(min-width: 1024px) 640px, 100vw"
        alt={asset.altText || asset.filename}
        className={styles.image}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}
