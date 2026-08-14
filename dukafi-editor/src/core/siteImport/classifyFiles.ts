/**
 * classifyFiles — assign a semantic role to every file in a FileMap.
 *
 * Role assignment uses the file extension (and MIME type when present).
 * Hidden files should be filtered before classification (ingestInput does
 * this). The classification is purely structural — no file bytes are read.
 *
 * Role table:
 *   html  → .html .htm
 *   css   → .css
 *   js    → .js .mjs .cjs
 *   image → .png .jpg .jpeg .webp .avif .svg .gif .ico
 *   font  → .woff .woff2 .ttf .otf .eot
 *   meta  → .txt .md .json + filenames README* LICENSE* CHANGELOG*
 *   binary→ everything else (uploaded as raw media assets)
 */

import type { FileMap, FileRole, ClassifiedFile } from './types'

// ---------------------------------------------------------------------------
// Extension / MIME → role mapping
// ---------------------------------------------------------------------------

/** Lowercase extension (without leading `.`) → role. */
const EXT_TO_ROLE: Record<string, FileRole> = {
  // HTML
  html: 'html',
  htm: 'html',
  // CSS
  css: 'css',
  // JavaScript
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',
  gif: 'image',
  ico: 'image',
  // Fonts
  woff: 'font',
  woff2: 'font',
  ttf: 'font',
  otf: 'font',
  eot: 'font',
  // Meta (informational — not imported)
  txt: 'meta',
  md: 'meta',
  json: 'meta',
}

/** Lowercase MIME type prefix → role (used when extension is absent or ambiguous). */
const MIME_PREFIX_TO_ROLE: Array<[string, FileRole]> = [
  ['text/html', 'html'],
  ['text/css', 'css'],
  ['text/javascript', 'js'],
  ['application/javascript', 'js'],
  ['application/x-javascript', 'js'],
  ['image/', 'image'],
  ['font/', 'font'],
  ['application/font', 'font'],
]

/** Filenames (case-insensitive) that always classify as `meta`. */
const META_FILENAMES = /^(README|LICENSE|CHANGELOG|NOTICE|CONTRIBUTING)(\..*)?$/i

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Classify every file in a FileMap by its semantic role.
 *
 * @returns An array of ClassifiedFile sorted by path for deterministic output.
 */
export function classifyFiles(fileMap: FileMap): ClassifiedFile[] {
  const result: ClassifiedFile[] = []

  for (const [path, entry] of Object.entries(fileMap.files)) {
    const role = resolveRole(path, entry.mimeType)
    result.push({
      path,
      role,
      size: entry.bytes.byteLength,
      bytes: entry.bytes,
      mimeType: entry.mimeType,
    })
  }

  // Deterministic order by path
  result.sort((a, b) => a.path.localeCompare(b.path))
  return result
}

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

function resolveRole(path: string, mimeType?: string): FileRole {
  // Check meta filenames first (e.g. README, LICENSE — no extension required)
  const basename = path.split('/').pop() ?? path
  if (META_FILENAMES.test(basename)) return 'meta'

  // Extension-based classification
  const extMatch = basename.match(/\.([^.]+)$/)
  if (extMatch) {
    const ext = extMatch[1].toLowerCase()
    const fromExt = EXT_TO_ROLE[ext]
    if (fromExt) return fromExt
  }

  // MIME-type fallback (when the extension is missing or unrecognised)
  if (mimeType) {
    const lowerMime = mimeType.toLowerCase()
    for (const [prefix, role] of MIME_PREFIX_TO_ROLE) {
      if (lowerMime.startsWith(prefix)) return role
    }
  }

  return 'binary'
}
