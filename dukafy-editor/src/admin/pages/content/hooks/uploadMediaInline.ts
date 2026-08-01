/**
 * Single-file upload helper for the content editor's paste / drop pipeline.
 *
 * The Media workspace's `useUploadQueue` is queue-shaped and tightly coupled
 * to its own UI state. For inline editor uploads we just need ONE file in
 * flight at a time, with a progress callback so the placeholder NodeView can
 * render an upload bar. Reusing the queue would mean mounting a parallel
 * workspace shell next to the editor — overkill.
 *
 * Returns the resolved `CmsMediaAsset` on success, throws otherwise. Caller
 * decides whether to register the asset with a folder, attach it to a
 * collection, etc. — the content editor just inserts a `media` node with
 * the asset's `publicPath`.
 */

import { normalizeCmsMediaAsset } from '@core/persistence/cmsMedia'
import { CmsMediaAssetEnvelopeSchema } from '@core/persistence/responseSchemas'
import type { CmsMediaAsset } from '@core/persistence'
import { compiledCheck } from '@core/utils/typeboxCompiler'

interface UploadOptions {
  file: File
  /** 0..1 — fires repeatedly while bytes stream. */
  onProgress?: (progress: number) => void
  /** AbortSignal — when fired, the XHR is aborted and the promise rejects with the signal's reason. */
  signal?: AbortSignal
}

export async function uploadMediaInline({ file, onProgress, signal }: UploadOptions): Promise<CmsMediaAsset> {
  if (signal?.aborted) {
    throw new DOMException('Upload aborted before start', 'AbortError')
  }

  return new Promise<CmsMediaAsset>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/admin/api/cms/media', true)
    xhr.withCredentials = true
    xhr.responseType = 'json'

    const abortListener = () => {
      try {
        xhr.abort()
      } catch {
        // ignore — abort can throw if xhr is already done
      }
    }
    signal?.addEventListener('abort', abortListener)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      signal?.removeEventListener('abort', abortListener)
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(extractError(xhr) ?? `Upload failed with ${xhr.status}`))
        return
      }
      const data = xhr.response as unknown
      if (!compiledCheck(CmsMediaAssetEnvelopeSchema, data)) {
        reject(new Error('Server response did not match the expected shape'))
        return
      }
      const wire = (data as { asset: Parameters<typeof normalizeCmsMediaAsset>[0] }).asset
      resolve(normalizeCmsMediaAsset(wire))
    }

    xhr.onerror = () => {
      signal?.removeEventListener('abort', abortListener)
      reject(new Error('Upload network error'))
    }

    xhr.onabort = () => {
      signal?.removeEventListener('abort', abortListener)
      reject(new DOMException('Upload aborted', 'AbortError'))
    }

    const body = new FormData()
    body.set('file', file)
    xhr.send(body)
  })
}

function extractError(xhr: XMLHttpRequest): string | null {
  const payload = xhr.response as unknown
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const message = (payload as { error?: unknown }).error
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return null
}

/**
 * Quickly classify a file as a media kind the editor can render. Files
 * outside these types are skipped (paste / drop falls through to default
 * browser behaviour, which inserts text).
 */
export function mediaKindOf(file: File): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}
