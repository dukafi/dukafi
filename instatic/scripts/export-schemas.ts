import { mkdir } from 'node:fs/promises'
import { PageSchema } from '../src/core/page-tree/page'
import { NodeTreeSchema } from '../src/core/page-tree/treeSchema'
import { SiteShellSchema } from '../src/core/page-tree/siteDocument'

const outputDirectory = new URL('../../dukafy/publisher/schemas/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })

const schemas = {
  page: PageSchema,
  node_tree: NodeTreeSchema,
  site_shell: SiteShellSchema,
}

for (const [name, schema] of Object.entries(schemas)) {
  await Bun.write(new URL(`${name}.schema.json`, outputDirectory), `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`exported ${name}.schema.json`)
}
