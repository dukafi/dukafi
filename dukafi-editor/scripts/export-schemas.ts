import { mkdir } from 'node:fs/promises'
import { PageSchema } from '../src/core/page-tree/page'
import { NodeTreeSchema } from '../src/core/page-tree/treeSchema'
import { SiteShellSchema } from '../src/core/page-tree/siteDocument'
import { COMMERCE_ENTITIES } from '../src/core/commerce/entitySchema'

const outputDirectory = new URL('../../dukafi/publisher/schemas/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })

const schemas = {
  page: PageSchema,
  node_tree: NodeTreeSchema,
  site_shell: SiteShellSchema,
}

// The commerce entity schemas are plain data, not TypeBox — Ruby reads them
// to know which fields exist and which are loopable, so both sides work from
// one definition instead of two that drift.
await Bun.write(
  new URL('commerce_entities.schema.json', outputDirectory),
  `${JSON.stringify(COMMERCE_ENTITIES, null, 2)}\n`,
)
console.log('exported commerce_entities.schema.json')

// The Google Fonts directory snapshot. The editor bundles it (and the picker
// reads it through the server so it stays a thin client), but the INSTALLER is
// Ruby — it needs the same family/variant/subset list to validate a request
// before reaching out to Google. Copied rather than re-fetched so both sides
// are always describing the same directory; refresh both by re-running
// `scripts/build-google-fonts.ts` and then this.
const fontsDirectory = new URL('../../dukafi/publisher/fonts/', import.meta.url)
await mkdir(fontsDirectory, { recursive: true })
await Bun.write(
  new URL('google-fonts.json', fontsDirectory),
  await Bun.file(new URL('../src/core/fonts/google-fonts.json', import.meta.url)).text(),
)
console.log('exported google-fonts.json')

for (const [name, schema] of Object.entries(schemas)) {
  await Bun.write(new URL(`${name}.schema.json`, outputDirectory), `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`exported ${name}.schema.json`)
}
