/**
 * Every inserter item must be reachable from some section.
 *
 * The dialog renders per SECTION, not from `allItems` — `allItems` only feeds
 * search and the Recent list. So an item could be built, returned, covered by
 * tests, and still be impossible to click, which is exactly what happened: the
 * commerce scaffolds ("Insert product", "Insert cart") and "Paste block…" were
 * in `allItems` for weeks with no section routing them anywhere.
 *
 * Recent doesn't count as reachability — an item can only become recent after
 * being inserted once, so an item reachable ONLY from Recent is unreachable.
 */

import { describe, expect, it } from 'bun:test'
import { buildModuleInserterItems } from '@site/module-picker/moduleInserterModel'
import type { ModuleInsertionContext } from '@site/module-picker/moduleInserterModel'

const PAGE_CTX: ModuleInsertionContext = {
  isVCMode: false, activeVcId: null, isTemplate: false, hasOutlet: false,
}

function build() {
  return buildModuleInserterItems({
    modules: [], context: PAGE_CTX, savedLayouts: [], visualComponents: [],
  })
}

describe('module inserter section coverage', () => {
  it('routes every item in allItems into a rendered section', () => {
    const model = build()
    // The groups the dialog actually renders, minus Recent.
    const rendered = new Set([
      ...model.moduleItems,
      ...model.savedLayoutItems,
      ...model.componentItems,
      ...model.blockItems,
    ].map((item) => item.key))

    const orphans = model.allItems
      .filter((item) => !rendered.has(item.key))
      .map((item) => `${item.kind}:${item.id}`)

    expect(orphans).toEqual([])
  })

  it('puts the commerce scaffolds and paste-block in the Blocks section', () => {
    const ids = build().blockItems.map((item) => item.id).sort()

    expect(ids).toEqual(['cart', 'import', 'product', 'products-loop', 'variants-loop'])
  })
})
