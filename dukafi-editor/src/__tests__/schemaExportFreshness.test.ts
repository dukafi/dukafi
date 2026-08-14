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

const OUT = new URL('../../../dukafi/publisher/schemas/', import.meta.url).pathname

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

  // The Google Fonts directory is copied rather than derived, but drifts the
  // same way: the picker offers families from the editor's copy while the Ruby
  // installer validates against its own. A family in one and not the other
  // installs as a 422 the merchant cannot explain.
  it('google-fonts.json matches the editor snapshot', () => {
    const source = readFileSync(
      new URL('../core/fonts/google-fonts.json', import.meta.url).pathname,
      'utf-8',
    )
    const exported = readFileSync(
      new URL('../../../dukafi/publisher/fonts/google-fonts.json', import.meta.url).pathname,
      'utf-8',
    )
    expect(exported).toBe(source)
  })
})
