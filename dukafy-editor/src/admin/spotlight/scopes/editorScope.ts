/**
 * Editor scope — context for editor-specific commands (Phase 2).
 * Stub: full implementation in Phase 2 with layers/breakpoints sub-scopes.
 */

import type { Scope } from '../types'

export const editorScope: Scope = {
  id: 'editor',
  title: 'Editor',
  placeholder: 'Search editor commands…',
  commands: () => [],  // Phase 2
}
