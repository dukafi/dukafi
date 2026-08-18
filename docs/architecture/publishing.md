# Publishing architecture

## Inputs and outputs

Publishing combines three persisted inputs:

- `SiteState.site`: settings, framework tokens, and shared site configuration
- `Page.document`: ordinary page and template node trees
- Prefetched catalog/media hashes: plain data prepared before rendering

The output is a directory of HTML pages and hashed CSS assets under
`dukafi/published/`. The pure publisher never reads SQLite or files itself.

## Document contract

Editor page documents are validated against exported JSON schemas in
`dukafi/publisher/schemas/`. A page includes its id, title, slug, root node id,
node map, and optional template target. Ruby validates the document on
assignment and independently validates the route slug.

Valid page slugs contain lowercase alphanumeric words separated by single
hyphens; segments may be separated by single slashes. `index` maps to `/`.
Built-in templates use `product-template` and `collection-template`.

## Rendering pipeline

`RenderPage` walks a node tree bottom-up:

1. Render child nodes.
2. Resolve breakpoint props and dynamic bindings.
3. Escape values at the renderer boundary and validate URLs.
4. Dispatch the module id through the Ruby registry.
5. Collect returned HTML, module CSS, body classes, and dependency information.

Commerce data is prefetched into hashes before this walk. Product and
collection templates receive a `current_entry`, allowing the same document to
render every matching catalog record without database access in publisher code.

## Tailwind and CSS

After all entries render, their HTML is combined only for class discovery and
sent to the pinned Tailwind CSS 4 standalone compiler. The resulting used
utilities are combined with reset, framework/token, and module CSS. Content is
hashed into filenames such as `site-1a2b3c4d5e6f.css`.

This means a class must exist in rendered published output to enter the bundle.
It also means the site gets one compact utility set rather than the entire
Tailwind framework. See [../tailwind.md](../tailwind.md).

## Atomic two-slot activation

Full publishing alternates between `slot_0` and `slot_1`:

1. Clear and prepare the inactive slot.
2. Render ordinary pages, active products, and collections.
3. Write all HTML and assets.
4. Replace the `current` symlink atomically.
5. In one database transaction, replace dependency rows and commit published
   documents/site state/version.

If any step fails, the incomplete slot is removed and the previous symlink is
restored. Visitors therefore do not observe a partially written release.

## Dependency-aware partial publishing

Published pages stay static HTML. A catalogue or data-table write must re-bake
every page that would show the change — including listings that did not yet
contain the new row.

Two indexes are filled at bake (`RebuildIndex`):

- `page_dependencies` — this path listed these **product ids**
- `page_sources` — this path loops this **source** (`products`, `data/team`,
  `reviews`, `collections/featured.products`)

The first finds the product page and every listing that already showed the
row. The second finds listings that would show a **new** row (a product added
to the catalogue, a team member added to `data/team`) without walking every
document. Writes look those paths up and `PartialBake` copies the current
slot, rerenders only those paths, deletes obsolete renamed paths, and
atomically activates the new slot.

`list_rebuild_targets` (MCP) and `GET /admin/api/cms/publish/rebuild-targets`
export the same map. A regression test exercises a 500-product catalog and
verifies that an isolated edit touches only its dependents.

## Storefront request selection

The storefront route chooses in this order:

1. Serve validated hashed CSS assets with immutable one-year cache headers.
2. Apply permanent product/collection slug redirects.
3. For a canonical request, read the baked page from `published/current` and
   return `X-Dukafy-Render: disk`.
4. Render collection pagination queries live.
5. Fall back to a live published page render.
6. Serve the designed baked/live `404` page or the minimal fallback.

Known tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`) do not force a
live render. Unsafe paths and unexpected asset filenames are rejected.
