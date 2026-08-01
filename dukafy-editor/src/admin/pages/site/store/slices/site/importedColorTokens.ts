import { nanoid } from 'nanoid'
import type { Draft } from 'mutative'
import { normalizeFrameworkColorSlug } from '@core/framework'
import type { FrameworkColorToken } from '@core/framework-schema'
import type { SiteDocument } from '@core/page-tree'
import type { ImportColorToken } from '@core/siteImport'

/**
 * Merge imported colour tokens into `site.settings.framework.colors` as PLAIN
 * BASE tokens. Each emits only `--<slug>`, so source `var(--<slug>)` references
 * keep resolving without generated utility classes or derived colour variants.
 */
export function addImportedColorTokens(
  site: Draft<SiteDocument>,
  colors: ImportColorToken[],
): { slug: string; value: string }[] {
  if (colors.length === 0) return []

  site.settings.framework ??= { colors: { tokens: [] } }
  site.settings.framework.colors ??= { tokens: [] }
  const tokens = site.settings.framework.colors.tokens

  const existingSlugs = new Set(tokens.map((t) => normalizeFrameworkColorSlug(t.slug)))
  let maxOrder = tokens.reduce((m, t) => Math.max(m, t.order ?? 0), -1)
  const committed: { slug: string; value: string }[] = []

  for (const { slug: rawSlug, value } of colors) {
    const slug = normalizeFrameworkColorSlug(rawSlug)
    if (existingSlugs.has(slug)) continue
    existingSlugs.add(slug)
    const now = Date.now()
    const token: FrameworkColorToken = {
      id: nanoid(),
      category: '',
      slug,
      lightValue: value,
      darkValue: '',
      darkModeEnabled: false,
      generateUtilities: { text: false, background: false, border: false, fill: false },
      generateTransparent: false,
      generateShades: { enabled: false, count: 0 },
      generateTints: { enabled: false, count: 0 },
      order: (maxOrder += 1),
      createdAt: now,
      updatedAt: now,
    }
    tokens.push(token)
    committed.push({ slug, value })
  }

  return committed
}

/**
 * Overwrite existing framework colour tokens in place. The existing token id,
 * slug, and generation flags are retained; only `lightValue` is replaced.
 */
export function overwriteImportedColorTokens(
  site: Draft<SiteDocument>,
  items: { existingTokenId: string; value: string }[],
): { slug: string; value: string }[] {
  if (items.length === 0) return []

  const tokens = site.settings.framework?.colors?.tokens
  if (!tokens || tokens.length === 0) return []

  const committed: { slug: string; value: string }[] = []
  for (const { existingTokenId, value } of items) {
    const existing = tokens.find((t) => t.id === existingTokenId)
    if (!existing) continue
    existing.lightValue = value
    existing.updatedAt = Date.now()
    committed.push({ slug: existing.slug, value })
  }

  return committed
}
