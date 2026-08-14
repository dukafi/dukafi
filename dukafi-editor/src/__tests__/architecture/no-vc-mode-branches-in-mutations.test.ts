/**
 * Architecture Gate — No VC mode branch in tree-mutation actions
 *
 * Three invariants enforced here (see the plan and CLAUDE.md's "Mutation API" section):
 *
 *   1. `src/core/page-tree/mutations.ts` is tree-agnostic — it must NOT contain the
 *      literal `kind === 'visualComponent'`. All mutations operate on a bare
 *      `NodeTree<TNode>` and are unaware of whether the caller is editing a page or VC.
 *
 *   2. The 11 named tree-mutation actions in `site/nodeActions.ts` must NOT contain
 *      `kind === 'visualComponent'` for tree routing. The ONLY place that branch may
 *      live is `mutateActiveTree` (in `site/helpers.ts`), the single shared routing
 *      helper that knows whether to write into page.nodes or vc.tree.nodes.
 *
 *   3. `childNodes` is dead — there is exactly one tree representation in this
 *      repo (`NodeTree<TNode>`). The three schema files that define node shapes
 *      must NOT contain the string `childNodes`:
 *        - `src/core/page-tree/baseNode.ts`
 *        - `src/core/page-tree/pageNode.ts`
 *        - `src/core/visualComponents/schemas.ts`
 *
 * Failure references:
 *   - Architecture plan: docs/superpowers/plans/2026-05-06-tree-unification.md
 *   - Code contract: CLAUDE.md §"Mutation API"
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '../../../')

function src(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8')
}

// ---------------------------------------------------------------------------
// Gate 1 — mutations.ts is tree-agnostic
// ---------------------------------------------------------------------------

describe('Gate 1 — mutations.ts has no VC mode branch', () => {
  it('src/core/page-tree/mutations.ts does NOT contain `kind === \'visualComponent\'`', () => {
    const content = src('src/core/page-tree/mutations.ts')
    const found = content.includes("kind === 'visualComponent'")
    if (found) {
      throw new Error(
        '[no-vc-mode-branches-in-mutations] src/core/page-tree/mutations.ts contains ' +
        "`kind === 'visualComponent'`. Mutations must be tree-agnostic — they take a " +
        '`NodeTree<TNode>` and know nothing about page vs. VC mode. Move any routing ' +
        'logic to `mutateActiveTree` in site/helpers.ts.\n\n' +
        'Reference: docs/superpowers/plans/2026-05-06-tree-unification.md, ' +
        'CLAUDE.md §"Mutation API"',
      )
    }
    expect(found).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — named tree-mutation actions in site/nodeActions.ts have no VC branch
// ---------------------------------------------------------------------------

/**
 * The 11 named tree-mutation store actions listed in CLAUDE.md §"Mutation API".
 * Each of these must delegate to `mutateActiveTree` and must not contain its own
 * `kind === 'visualComponent'` branch.
 *
 * `insertComponentRef` is intentionally excluded — it uses `kind === 'visualComponent'`
 * for the cycle guard (not tree routing), and it is not a raw tree-mutation action.
 * `mutateActiveTree` itself is also excluded — it IS the single approved home for
 * the routing branch.
 */
const NAMED_TREE_MUTATION_ACTIONS: string[] = [
  'insertNode',
  'deleteNode',
  'updateNodeProps',
  'setBreakpointOverride',
  'clearBreakpointOverride',
  'renameNode',
  'toggleNodeLocked',
  'toggleNodeHidden',
  'moveNode',
  'duplicateNode',
  'wrapNode',
]

/**
 * Path to the file that owns the named tree-mutation actions.
 *
 * After the siteSlice refactor (`siteSlice.ts` → `site/` directory), the 11
 * named actions live inside `createNodeActions`'s returned object literal.
 * Each entry is at 4-space indent (2 for the function body + 2 for the
 * object property).
 */
const NODE_ACTIONS_PATH = 'src/admin/pages/site/store/slices/site/nodeActions.ts'

/**
 * Extract a named action's body from the action object literal in
 * `site/nodeActions.ts`.
 *
 * Actions live inside `const actions: NodeActions = { ... }` so each property
 * key is at 4-space indent. The body ends at the start of the next top-level
 * entry in the same object (also 4 spaces) or the closing `  }`.
 *
 * Returns an empty string if the action is not found.
 */
function extractActionBody(content: string, actionName: string): string {
  const marker = `\n    ${actionName}:`
  const startIdx = content.indexOf(marker)
  if (startIdx === -1) return ''

  // Everything from the marker onward (skipping the leading \n)
  const fromMarker = content.slice(startIdx + 1)

  // Next top-level entry starts with `\n    <letter-or-_-or-$>` (4 spaces)
  const nextEntryMatch = fromMarker.search(/\n {4}[a-zA-Z_$]/)
  return nextEntryMatch === -1 ? fromMarker : fromMarker.slice(0, nextEntryMatch)
}

describe('Gate 2 — named tree-mutation actions in site/nodeActions.ts have no VC branch', () => {
  const nodeActionsContent = src(NODE_ACTIONS_PATH)

  for (const actionName of NAMED_TREE_MUTATION_ACTIONS) {
    it(`${actionName} body does NOT contain \`kind === 'visualComponent'\``, () => {
      const body = extractActionBody(nodeActionsContent, actionName)

      if (body === '') {
        throw new Error(
          `[no-vc-mode-branches-in-mutations] Could not find action "${actionName}" in ` +
          `${NODE_ACTIONS_PATH}. Either the action was renamed or its indentation ` +
          'changed. Update this gate to match.',
        )
      }

      const found = body.includes("kind === 'visualComponent'")
      if (found) {
        throw new Error(
          `[no-vc-mode-branches-in-mutations] ${NODE_ACTIONS_PATH} action "${actionName}" ` +
          `contains \`kind === 'visualComponent'\` for tree routing. ` +
          'This routing must live ONLY in `mutateActiveTree` (site/helpers.ts). ' +
          'Refactor the action to call `mutateActiveTree(fn)` and let the helper ' +
          'route to the correct tree.\n\n' +
          'Reference: docs/superpowers/plans/2026-05-06-tree-unification.md, ' +
          'CLAUDE.md §"Mutation API"',
        )
      }
      expect(found).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// Gate 3 — `childNodes` is dead in the three core schema files
//
// `childNodes` is dead — there is exactly one tree representation in this
// repo (`NodeTree<TNode>`). The schema files that define node shapes have no
// legitimate reason to declare or document a `childNodes` field.
// ---------------------------------------------------------------------------

const SCHEMA_FILES: Array<[string, string]> = [
  ['src/core/page-tree/baseNode.ts', 'BaseNode — shared structural base'],
  ['src/core/page-tree/pageNode.ts', 'PageNode schema'],
  ['src/core/visualComponents/schemas.ts', 'VisualComponent + VCNode schemas'],
]

describe('Gate 3 — `childNodes` does not appear in core schema files', () => {
  for (const [relPath, label] of SCHEMA_FILES) {
    it(`${label} (${relPath}) does not contain "childNodes"`, () => {
      const content = src(relPath)
      const found = content.includes('childNodes')
      if (found) {
        const lines = content.split('\n')
        const matches = lines
          .map((line, i) => ({ line, num: i + 1 }))
          .filter(({ line }) => line.includes('childNodes'))
          .map(({ line, num }) => `  Line ${num}: ${line.trim()}`)
          .join('\n')

        throw new Error(
          `[no-vc-mode-branches-in-mutations] "${relPath}" still contains "childNodes".\n` +
          '`childNodes` is dead — there is exactly one tree representation in this repo ' +
          '(`NodeTree<TNode>`). Remove all references to `childNodes` from this schema file ' +
          '(including comments).\n\n' +
          `Occurrences:\n${matches}\n\n` +
          'Reference: docs/superpowers/plans/2026-05-06-tree-unification.md, ' +
          'CLAUDE.md §"Mutation API"',
        )
      }
      expect(found).toBe(false)
    })
  }
})
