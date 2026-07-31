/**
 * Avatar URL resolution shared by admin UI surfaces.
 *
 * The CMS stores a user's uploaded avatar as a media asset (referenced via
 * `users.avatar_media_id`). When that's null we fall back to Gravatar.
 * Gravatar's URL takes a SHA-256 (or MD5) hash of the user's normalized
 * email; the server hands the hash to the client as `gravatarHash` so the
 * browser doesn't have to recompute it on every render.
 *
 * `?d=identicon` makes Gravatar render a deterministic geometric pattern
 * when the email isn't registered with the service, so every user gets a
 * stable picture even before they upload their own. The hash is the same
 * for every size, so the rendered identicon stays visually identical
 * across the toolbar trigger (28px) and the Profile tab (96px).
 */

const GRAVATAR_BASE = 'https://www.gravatar.com/avatar'

/** Default Gravatar style when the email is unknown to Gravatar. */
const GRAVATAR_DEFAULT = 'identicon'

interface GravatarOptions {
  /** Rendered pixel size — Gravatar caps at 2048. We retina-scale by 2×. */
  size: number
}

/**
 * Build a Gravatar URL for the given pre-computed hash. The size is doubled
 * so the image renders crisp on retina displays; CSS still scales it back
 * down to `size` CSS pixels.
 */
function gravatarUrl(gravatarHash: string, options: GravatarOptions): string {
  const px = Math.max(16, Math.min(512, Math.round(options.size * 2)))
  return `${GRAVATAR_BASE}/${gravatarHash}?s=${px}&d=${GRAVATAR_DEFAULT}`
}

/**
 * Resolve the avatar image URL for a user, preferring an uploaded asset over
 * the Gravatar fallback. Returns null when neither is available (the caller
 * should render initials instead). In practice `gravatarHash` is always set
 * for authenticated users, so this only returns null for unauthenticated /
 * placeholder users.
 */
export function resolveAvatarUrl(
  user: { avatarUrl: string | null; gravatarHash: string | null },
  options: GravatarOptions,
): string | null {
  if (user.avatarUrl && user.avatarUrl.length > 0) return user.avatarUrl
  if (user.gravatarHash && user.gravatarHash.length > 0) return gravatarUrl(user.gravatarHash, options)
  return null
}
