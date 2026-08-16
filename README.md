# Dukafi

**Own your store. One click to live.**

Dukafi is a self-hosted, ecommerce-focused visual CMS. Merchants manage a
catalog and design the customer-facing store in one editor. Publishing turns
the design into static HTML and a content-hashed CSS bundle, while genuinely
live concerns such as inventory and carts remain small server-rendered
fragments.

This repository is an active pre-production implementation. Page publishing,
catalog management, commerce canvas modules, responsive images, and the first
cart fragments work today. Checkout, orders, discounts, deployment hardening,
and backups remain on the roadmap.

## System at a glance

```text
Browser editor (:5173/admin)
      │ saves page JSON and catalog changes
      ▼
Ruby API (:9292/admin/api/cms) ──────▶ SQLite + local uploads
      │ Publish
      ▼
Pure Ruby renderer ──▶ used Tailwind utilities ──▶ published/slot_N
                                                   │ atomic symlink flip
                                                   ▼
Customer storefront (:9292) ◀── static HTML/CSS + HTMX live fragments
```

The editor and storefront have deliberately different responsibilities:

- `/admin/` is the authenticated CMS. Site design, products, variants,
  collections, media, and imports happen here.
- `/` is only the public storefront. No merchant administration is exposed on
  customer-facing pages.
- Product data is not copied into a separate canvas page per product. A shared
  Product template binds to the current catalog entry and produces every
  `/products/<slug>` page.
- A shared Collection template similarly produces `/collections/<slug>` pages.

## Implemented capabilities

### CMS and catalog

- First-owner setup, bcrypt login, cookie sessions, and persisted preferences
- Canvas page load/save, page CRUD, drafts, and publishing
- Products with status, vendor, sanitized rich HTML description, and variants
- Integer-cent prices, currency codes, inventory, SKU, and variant ordering
- Collections with ordered product membership
- Transactional CSV import, updating by product slug and variant SKU
- Media upload/list/delete and responsive WebP variants through libvips
- Permanent storefront redirects after product or collection slug changes

### Visual commerce building

The editor and Ruby publisher implement matching modules for:

- Product cards
- Price
- Image gallery with responsive `srcset`
- Variant picker
- Buy button
- Collection loop with pagination
- Live stock badge
- Live cart badge

Blank product or collection slug properties bind to the current entry when a
module is used in the matching Product or Collection template. This is what
makes one template dynamic across the whole catalog.

### Publishing and storefront

- Pure, synchronous document-to-HTML Ruby publisher
- Published regular pages plus generated product and collection routes
- Tailwind CSS 4 compiled only from class tokens found in rendered output
- Responsive utilities (`p-8`, `px-8`, `md:grid-cols-2`), state variants, and
  arbitrary values supported by the compiler
- Content-hashed CSS assets and atomic two-slot publish activation
- Disk-first storefront serving with live fallback
- Tracking-only query parameters retain the static fast path
- Collection pagination queries render live
- Dependency tracking and targeted rebakes after catalog changes
- Anonymous session cart, add-to-cart, stock fragment, and cart-badge fragment

## Technology stack

| Layer | Technology | Role |
| --- | --- | --- |
| Server | Ruby 3.4, Roda, Puma, Rack | API, storefront routing, fragments |
| Data | SQLite in WAL mode, Sequel | CMS, catalog, sessions, dependencies |
| Editor | `dukafi-editor/` — a Dukafi fork of Instatic, React 19 + Vite, Bun | Authenticated visual CMS |
| Storefront | Static semantic HTML, HTMX 2 fragments | Fast public experience |
| Publisher | Plain Ruby modules | Deterministic page rendering |
| CSS | Tailwind CSS 4 standalone + framework/module CSS | Used-class-only bundle |
| Images | image_processing, ruby-vips/libvips | Responsive WebP variants |
| Payments | Stripe gem | Dependency present; checkout is not complete |

Bun is used only to develop/build the editor. The storefront does not ship a
React runtime, and a fully static page needs no publisher JavaScript.

## Quick start

Requirements: Ruby 3.4+, Bundler, Bun 1.x+, and libvips.

```bash
sudo apt-get install libvips
cd dukafi
bundle install
cd ../dukafi-editor
bun install
cd ..
./bin/dev
```

`./bin/dev` installs/verifies the pinned Tailwind executable, applies database
migrations, and starts both development processes.

Open:

- Editor: <http://localhost:5173/admin/>
- Commerce workspace: <http://localhost:5173/admin/commerce>
- Storefront: <http://localhost:9292/>
- Ruby API/storefront directly: <http://localhost:9292/>

On first use, complete the owner setup form. To seed demo commerce data:

```bash
cd dukafi
bundle exec ruby scripts/seed_demo_store.rb
```

See [SETUP.md](SETUP.md) for complete installation, environment, troubleshooting,
testing, and recovery instructions.

## Everyday workflow

1. Start the system with `./bin/dev`.
2. Manage products and collections under **Commerce**.
3. Open **Site** and edit ordinary pages, **Product template**, or
   **Collection template**.
4. Add commerce modules from the module inserter. In templates, leave the
   catalog slug blank to use the current product/collection.
5. Save the draft, then click **Publish**.
6. Visit `/products/<product-slug>` or `/collections/<collection-slug>` on port
   9292. Products must have status `active` to be generated.

Publishing is distinct from saving: Save persists editor state; Publish creates
and activates the customer-facing files.

## Repository layout

```text
bin/dev                         one-command development launcher
dukafi/                         Ruby product
  config/                       database and runtime configuration
  db/migrations/                ordered schema migrations
  models/                       Sequel models
  publisher/                    pure renderers, schemas, module registry
  routes/                       CMS API, storefront, fragments, checkout
  services/                     publish, bake, templates, imports, media
  spec/                         Minitest and golden-output tests
  published/                    generated two-slot output (ignored)
  uploads/                      merchant originals/variants (ignored)
dukafi-editor/                  Dukafi's fork of Instatic's editor client (tracked)
reference/instatic/             full upstream Instatic clone; diff-only, gitignored, never executed
docs/                           focused architecture and workflow guides
```

`dukafi-editor/` is a fork of [Instatic](https://github.com/corebunch/dukafi)
and is tracked as part of this monorepo like everything else — Ruby API changes
and editor changes land in the same commit. `reference/instatic/` is a separate,
full clone of upstream kept only so the fork can be diffed against it; it's
gitignored and never built or run.

## Tests

```bash
cd dukafi
bundle exec rake test

cd ../dukafi-editor
bun run build
```

Publisher modules use golden HTML tests, and a purity test prevents database,
filesystem, or network access from leaking into `dukafi/publisher/`.

## Important invariants

- Money is always integer cents, never floating point.
- Public page slugs use lowercase alphanumeric segments, single hyphens, and
  optional single slashes. Built-in templates use `product-template` and
  `collection-template`; migration 015 repairs older underscore-prefixed data.
- Stock is checked dynamically and should not require a full site publish.
- Publisher code is pure: data in, strings out.
- `reference/` is read-only reference material.
- Uploaded media, the SQLite database, generated output, editor checkout, and
  local Tailwind binary are intentionally ignored by Git.

## Documentation map

- [SETUP.md](SETUP.md) — install, run, configure, verify, and troubleshoot
- [docs/editor-commerce-workflow.md](docs/editor-commerce-workflow.md) — products,
  templates, dynamic bindings, publishing, and storefront URLs
- [docs/architecture/publishing.md](docs/architecture/publishing.md) — renderer,
  Tailwind, atomic slots, dependencies, and request paths
- [docs/api-contract.md](docs/api-contract.md) — editor/Ruby HTTP contract
- [docs/csv-import.md](docs/csv-import.md) — catalog import schema
- [docs/tailwind.md](docs/tailwind.md) — used-class-only CSS behavior
- [VISION.md](VISION.md) — product direction and boundaries
- [MILESTONES.md](MILESTONES.md) — implementation status and next work

## Attribution

The visual editing experience is derived from
[Instatic](https://github.com/CoreBunch/Instatic), © David Babinec, under the
MIT License. Dukafi reimplements the server contract in Ruby and keeps the
upstream server copy as read-only reference material.
