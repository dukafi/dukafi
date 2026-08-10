import { mkdir } from 'node:fs/promises'
import { PageSchema } from '../src/core/page-tree/page'
import { NodeTreeSchema } from '../src/core/page-tree/treeSchema'
import { SiteShellSchema } from '../src/core/page-tree/siteDocument'
import { COMMERCE_ENTITIES } from '../src/core/commerce/entitySchema'

const outputDirectory = new URL('../../dukafy/publisher/schemas/', import.meta.url)
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

for (const [name, schema] of Object.entries(schemas)) {
  await Bun.write(new URL(`${name}.schema.json`, outputDirectory), `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`exported ${name}.schema.json`)
}
