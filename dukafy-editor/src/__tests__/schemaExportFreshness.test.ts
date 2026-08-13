/**
 * The schemas Ruby validates against are GENERATED from these TypeScript
 * definitions by `scripts/export-schemas.ts`. Nothing regenerates them
 * automatically, so adding a field here and forgetting to run the script
 * leaves the publisher rejecting documents the editor happily produces.
 *
 * That is not hypothetical: adding `cart.addItem` (plus `productSlug` and
 * `variantSku`) without regenerating made every save of a page containing an
 * add-to-cart button fail with a 422 — the editor and the server disagreeing
 * about what a valid document is.
 *
 * This test fails the moment they drift.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PageSchema, NodeTreeSchema, SiteShellSchema } from '@core/page-tree'
import { COMMERCE_ENTITIES } from '@core/commerce/entitySchema'

const OUT = new URL('../../../dukafy/publisher/schemas/', import.meta.url).pathname

function checkedIn(name: string): string {
  return readFileSync(`${OUT}${name}`, 'utf-8')
}

describe('exported schemas are up to date', () => {
  const cases: Array<[string, unknown]> = [
    ['page.schema.json', PageSchema],
    ['node_tree.schema.json', NodeTreeSchema],
    ['site_shell.schema.json', SiteShellSchema],
    ['commerce_entities.schema.json', COMMERCE_ENTITIES],
  ]

  for (const [file, schema] of cases) {
    it(`${file} matches its TypeScript source`, () => {
      expect(checkedIn(file)).toBe(`${JSON.stringify(schema, null, 2)}\n`)
    })
  }
})
