import { useEffect, useState } from 'react'
import {
  listCmsMediaAssets,
  type CmsMediaAsset,
} from '@core/persistence'
import { readFeaturedMediaCell } from '@core/data/cells'
import type { DataRow } from '@core/data/schemas'
import { mediaTypeFromAsset } from '@content/utils/contentEntryUtils'
import { useStandaloneMediaEditor } from '@admin/pages/media/hooks/useStandaloneMediaEditor'
import type { MediaAssetEditor } from '@admin/pages/media/components/MediaViewerWindow/MediaViewerWindow'
import type { ContentMediaType, MediaAttributes } from '@content/nodes/MediaNode'
import { getErrorMessage } from '@core/utils/errorMessage'

type MediaPickerKind = 'media' | 'featured'

interface MediaPickerState {
  kind: MediaPickerKind
}

interface UseContentMediaPickerOptions {
  featuredMediaId: string | null
  setFeaturedMediaId: (mediaId: string | null) => void
  /**
   * Called with the picked asset's editor payload when the user confirms a
   * "body media" selection. The host wires this into the Tiptap editor's
   * `insertMedia` imperative handle.
   */
  insertBodyMedia: (attrs: MediaAttributes) => void
  /**
   * Entries currently shown in the sidebar list. Any entry with a non-null
   * `featuredMedia` cell triggers the asset list to load so the explorer can
   * render the featured image as a row thumbnail.
   */
  entries: readonly DataRow[]
}

/**
 * Coordinates the content-page media picker. The picker UI itself is the
 * full WordPress-style `MediaPickerModal` (folder tree + canvas grid + upload
 * queue) — this hook owns only the open/close state and the post-pick
 * routing (set featured media vs insert a body media node).
 *
 * We still fetch the CMS media list locally so the right-rail settings panel
 * can render the picked featured media (thumbnail + filename). The modal
 * mounts its own workspace when opened, so it doesn't share this asset list.
 */
export function useContentMediaPicker({
  featuredMediaId,
  setFeaturedMediaId,
  insertBodyMedia,
  entries,
}: UseContentMediaPickerOptions) {
  const [mediaAssets, setMediaAssets] = useState<CmsMediaAsset[]>([])
  const [mediaAssetsLoaded, setMediaAssetsLoaded] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaPicker, setMediaPicker] = useState<MediaPickerState | null>(null)
  // MediaViewerWindow state: when set, the viewer opens with this asset so
  // authors can edit alt text, caption, tags, replace the file — same window
  // the Media page uses, mounted here so the featured-media field's "Edit"
  // affordance works without leaving the Content page.
  const [viewerAssetId, setViewerAssetId] = useState<string | null>(null)

  const assetsById = new Map<string, CmsMediaAsset>()
  for (const asset of mediaAssets) assetsById.set(asset.id, asset)

  const featuredMediaAsset = featuredMediaId ? assetsById.get(featuredMediaId) ?? null : null

  // True when at least one shown entry references a featured media asset, so
  // the explorer list can render a thumbnail. Combined with the active entry's
  // own `featuredMediaId` so the right-rail preview also triggers a load.
  const needsAssetList = featuredMediaId !== null
    || entries.some((entry) => readFeaturedMediaCell(entry.cells) !== null)

  // Fetch the asset list once the page actually needs to resolve a featured
  // media reference — either for the right-rail preview of the selected entry
  // or for thumbnails in the sidebar list. The picker modal mounts its own
  // workspace, so we don't need to eagerly load assets just to open the picker.
  useEffect(() => {
    if (!needsAssetList || mediaAssetsLoaded) return
    let cancelled = false
    listCmsMediaAssets()
      .then((assets) => {
        if (!cancelled) {
          setMediaAssets(assets)
          setMediaError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = getErrorMessage(err, 'Could not load media')
          setMediaError(message)
          console.error('[ContentPage] load media list error:', err)
        }
      })
      .finally(() => {
        if (!cancelled) setMediaAssetsLoaded(true)
      })
    return () => { cancelled = true }
  }, [needsAssetList, mediaAssetsLoaded])

  const getFeaturedMediaAssetForEntry = (entry: DataRow): CmsMediaAsset | null => {
    const mediaId = readFeaturedMediaCell(entry.cells)
    if (!mediaId) return null
    return assetsById.get(mediaId) ?? null
  }

  const openMediaPicker = (kind: MediaPickerKind) => {
    setMediaPicker({ kind })
  }

  const closeMediaPicker = () => {
    setMediaPicker(null)
  }

  const openMediaViewer = (assetId: string) => {
    setViewerAssetId(assetId)
  }

  const closeMediaViewer = () => {
    setViewerAssetId(null)
  }

  const viewerAsset = viewerAssetId
    ? mediaAssets.find((asset) => asset.id === viewerAssetId) ?? null
    : null

  const viewerEditor: MediaAssetEditor | null = useStandaloneMediaEditor({
    asset: viewerAsset,
    assets: mediaAssets,
    onAssetChanged: (asset) =>
      setMediaAssets((current) => current.map((item) => (item.id === asset.id ? asset : item))),
    onAssetRemoved: (id) => {
      setMediaAssets((current) => current.filter((item) => item.id !== id))
      if (viewerAssetId === id) setViewerAssetId(null)
    },
  })

  const pickMedia = (asset: CmsMediaAsset) => {
    if (!mediaPicker) return

    // Keep the local asset cache in sync so the featured-media preview can
    // render the freshly picked asset's thumbnail without re-fetching the
    // whole list.
    setMediaAssets((current) => {
      if (current.some((a) => a.id === asset.id)) return current
      return [asset, ...current]
    })

    if (mediaPicker.kind === 'featured') {
      setFeaturedMediaId(asset.id)
      setMediaPicker(null)
      return
    }

    const mediaType: ContentMediaType = mediaTypeFromAsset(asset)
    insertBodyMedia({
      mediaType,
      src: asset.publicPath,
      alt: mediaType === 'image' ? asset.filename : '',
    })
    setMediaPicker(null)
  }

  return {
    mediaError,
    mediaPicker,
    featuredMediaAsset,
    getFeaturedMediaAssetForEntry,
    openMediaPicker,
    closeMediaPicker,
    pickMedia,
    // MediaViewerWindow plumbing — exposed so the Content page can mount the
    // viewer once at the root and the settings panel can request edits.
    viewerEditor,
    viewerOpen: viewerAsset !== null,
    openMediaViewer,
    closeMediaViewer,
  }
}
