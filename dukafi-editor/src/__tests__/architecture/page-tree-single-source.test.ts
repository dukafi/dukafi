import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')

const FORM_TREE_CONSUMERS = [
  'src/core/forms/snapshot.ts',
  'src/admin/pages/site/panels/PropertiesPanel/formSettingsAnalysis.ts',
]

function source(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), 'utf8')
}

describe('Page-tree selector source of truth', () => {
  test('form analysis uses @core/page-tree traversal helpers instead of local tree walkers', () => {
    for (const file of FORM_TREE_CONSUMERS) {
      const content = source(file)
      expect(content, `${file} must not define a local recursive tree walker`).not.toMatch(
        /\bfunction\s+walkTree\s*\(/,
      )
      expect(content, `${file} must not derive a parent map from children arrays`).not.toMatch(
        /\bfunction\s+buildParentMap\s*\(/,
      )
    }
  })
})
