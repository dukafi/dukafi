import type { CmsMediaAsset } from '@core/persistence/cmsMedia'

export const SMART_MISSING_ALT = 'smart:missing-alt' as const
export const SMART_MISSING_TITLE = 'smart:missing-title' as const
export const SMART_UNTAGGED = 'smart:untagged' as const
export const SMART_LARGE_FILES = 'smart:large-files' as const
export const SMART_RECENTLY_REPLACED = 'smart:recently-replaced' as const

export type SmartFolderId =
  | typeof SMART_MISSING_ALT
  | typeof SMART_MISSING_TITLE
  | typeof SMART_UNTAGGED
  | typeof SMART_LARGE_FILES
  | typeof SMART_RECENTLY_REPLACED

const SMART_FOLDER_IDS = new Set<string>([
  SMART_MISSING_ALT,
  SMART_MISSING_TITLE,
  SMART_UNTAGGED,
  SMART_LARGE_FILES,
  SMART_RECENTLY_REPLACED,
])

const LARGE_FILE_BYTES = 1024 * 1024

function isImageAsset(asset: CmsMediaAsset): boolean {
  return asset.mimeType.startsWith('image/')
}

export function isSmartFolderId(value: string): value is SmartFolderId {
  return SMART_FOLDER_IDS.has(value)
}

export function smartFolderPredicate(id: SmartFolderId): (asset: CmsMediaAsset) => boolean {
  switch (id) {
    case SMART_MISSING_ALT:
      return (asset) => isImageAsset(asset) && asset.altText.trim().length === 0
    case SMART_MISSING_TITLE:
      return (asset) => isImageAsset(asset) && asset.title.trim().length === 0
    case SMART_UNTAGGED:
      return (asset) => asset.tags.length === 0
    case SMART_LARGE_FILES:
      return (asset) => asset.sizeBytes > LARGE_FILE_BYTES
    case SMART_RECENTLY_REPLACED:
      return (asset) => asset.replacedAt !== null
  }
}
