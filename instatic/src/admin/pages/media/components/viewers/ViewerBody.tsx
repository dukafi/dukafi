/**
 * ViewerBody — picks the right viewer for an asset's MIME type.
 *
 * Today: `image/*` → ImageViewer,
 *        `video/*` → VideoViewer,
 *        everything else → FallbackViewer.
 *
 * The dispatcher lives in one file so adding a new viewer type later (text,
 * PDF, 3D, …) is a single edit here.
 */
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'
import { bucketForMime } from '../../utils/filters'
import { ImageViewer } from './ImageViewer'
import { VideoViewer } from './VideoViewer'
import { FallbackViewer } from './FallbackViewer'

interface ViewerBodyProps {
  asset: CmsMediaAsset
}

export function ViewerBody({ asset }: ViewerBodyProps) {
  const bucket = bucketForMime(asset.mimeType)
  if (bucket === 'image') {
    return <ImageViewer asset={asset} />
  }
  if (bucket === 'video') {
    return <VideoViewer src={asset.publicPath} />
  }
  return (
    <FallbackViewer
      publicPath={asset.publicPath}
      filename={asset.filename}
      mimeType={asset.mimeType}
    />
  )
}
