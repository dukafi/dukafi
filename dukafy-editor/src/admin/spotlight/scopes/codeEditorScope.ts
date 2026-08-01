/**
 * Code editor scope — search site files for opening in the code editor panel.
 *
 * Phase 3 §E: "Open file in code editor" via SiteFile list.
 * Triggered from the "Open code editor…" command in commands/panels.ts.
 *
 * Backed by siteFilesProvider (LOCAL, reads site.files from editor store).
 */

import type { Scope } from '../types'
import { siteFilesProvider } from '../providers/siteFilesProvider'

export const codeEditorScope: Scope = {
  id: 'codeEditor',
  title: 'Open file in code editor',
  placeholder: 'Search site files…',
  commands: () => [],
  providers: [siteFilesProvider],
}
