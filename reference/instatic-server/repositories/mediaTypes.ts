/**
 * Media repository domain types.
 *
 * Kept outside the CRUD repository and row mapper so both can share the same
 * asset shape without importing each other.
 */

export interface MediaVariant {
  width: number
  height: number
  format: 'webp' | 'jpeg' | 'png' | 'avif'
  /**
   * Public URL the renderer emits (`/uploads/<storage>` for local; an absolute
   * URL for public external storage; local route again for redirect/proxy modes).
   */
  path: string
  sizeBytes: number
  /** Adapter-internal storage handle. */
  storagePath: string
  /** Adapter id that wrote this variant; `''` for the built-in local adapter. */
  storageAdapterId: string
}

export interface MediaAsset {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  publicPath: string
  uploadedByUserId: string | null
  createdAt: string
  altText: string
  caption: string
  title: string
  tags: string[]
  width: number | null
  height: number | null
  durationMs: number | null
  dominantColor: string | null
  deletedAt: string | null
  replacedAt: string | null
  folderIds: string[]
  blurHash: string | null
  variants: MediaVariant[]
  posterPath: string | null
  /** Empty string for the built-in local-disk adapter. */
  storageAdapterId: string
  /** True when bytes live outside the host uploads dir. */
  externallyHosted: boolean
}
