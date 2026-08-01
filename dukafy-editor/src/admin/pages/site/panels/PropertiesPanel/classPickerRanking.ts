/**
 * ClassPicker autocomplete ranking — exact > prefix > word-boundary > substring.
 *
 * Tiered scoring that intentionally puts the user's exact intent at the top:
 * typing "text" should surface the class literally named "text" before any
 * `text-*` utility, even though both contain the substring. Within a tier we
 * prefer shorter (more specific) names, then fall back to alphabetical order
 * for fully deterministic, scroll-stable results.
 *
 * Lives alongside ClassPicker but in its own module — Fast Refresh requires
 * component files to export only components, so the ranking helpers (and
 * their tests) live here.
 */

const WORD_BOUNDARY_PREFIX_CHARS = ['-', '_', ' ', '/']

/**
 * Score a single class name against a (lowercased) query.
 *
 *   4 = exact match              ("text" → "text")
 *   3 = prefix match             ("text" → "text-bg-body-5")
 *   2 = word-boundary match      ("body" → "text-bg-body-5")
 *   1 = anywhere substring       ("od"   → "text-bg-body-5")
 *   0 = no match
 */
export function scoreClassNameMatch(name: string, query: string): number {
  if (!query) return 0
  const n = name.toLowerCase()
  const q = query
  if (n === q) return 4
  if (n.startsWith(q)) return 3
  for (const sep of WORD_BOUNDARY_PREFIX_CHARS) {
    if (n.includes(sep + q)) return 2
  }
  if (n.includes(q)) return 1
  return 0
}

/**
 * Rank a list of items by `scoreClassNameMatch` (desc), then by name length
 * (asc — shorter is more specific), then alphabetically. Items that score 0
 * are filtered out.
 */
export function rankBySuggestionScore<T extends { name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const scored: Array<{ item: T; score: number }> = []
  for (const item of items) {
    const score = scoreClassNameMatch(item.name, query)
    if (score > 0) scored.push({ item, score })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.item.name.length !== b.item.name.length) {
      return a.item.name.length - b.item.name.length
    }
    return a.item.name.localeCompare(b.item.name)
  })
  return scored.map((entry) => entry.item)
}
