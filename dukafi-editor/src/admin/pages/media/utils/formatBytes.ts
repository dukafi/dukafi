/**
 * Human-readable file size for the Media workspace.
 *
 * Binary units (1 KB = 1024 B). KB/MB show one decimal, GB shows two — the
 * tone used across the media asset viewer, canvas tiles, upload queue, and
 * replace-file dialog. Other surfaces with different needs (estimate ranges,
 * MB-capped font sizes) keep their own bespoke formatters intentionally.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
