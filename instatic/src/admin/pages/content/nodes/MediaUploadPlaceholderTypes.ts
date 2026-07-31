export type MediaUploadKind = 'image' | 'video'
export type MediaUploadStatus = 'uploading' | 'failed'

export interface MediaUploadPlaceholderAttributes {
  /** Stable identifier the host uses to find this placeholder for replacement. */
  uploadId: string
  filename: string
  kind: MediaUploadKind
  /** 0..1 — driven by XHR upload-progress events. */
  progress: number
  status: MediaUploadStatus
  /** Optional error message when `status === 'failed'`. */
  error: string | null
  /** Object URL of the source File so we can show a thumbnail. Caller revokes on swap. */
  previewUrl: string | null
}
