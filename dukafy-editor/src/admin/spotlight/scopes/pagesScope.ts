/**
 * Pages scope — lists all site pages for navigation.
 *
 * Phase 3: replaced the Phase 2 dynamic command iteration with `pagesProvider`
 * as the single source of truth. The provider is LOCAL (reads editor store)
 * and synchronous (debounceMs: 0), so the UX is indistinguishable from Phase 2's
 * sync approach — but the provider lifecycle is managed uniformly by the runner.
 */

import type { Scope } from '../types'
import { pagesProvider } from '../providers/pagesProvider'

export const pagesScope: Scope = {
  id: 'pages',
  title: 'Switch to page',
  placeholder: 'Search pages…',
  commands: () => [],
  providers: [pagesProvider],
}
