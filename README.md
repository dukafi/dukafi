# Dukafy

**Own your store. One click to live.**

Dukafy is a self-hosted, ecommerce-only visual CMS. A merchant manages their
catalog and designs storefront pages in a visual editor; Dukafy publishes the
result as clean, static HTML and compact CSS. Dynamic features such as stock,
cart, and checkout are delivered only where they are actually needed.

The project is aimed at small, design-conscious stores that want ownership and
speed without assembling a headless stack or depending permanently on a hosted
commerce platform.

## How it works

```text
Visual editor ──save──▶ SQLite ──publish──▶ static HTML + used CSS
                            │                    │
Commerce admin ─────────────┘                    ├── served from disk
                                                 └── HTMX fragments for live data
```

- The editor saves page documents through the Ruby admin API.
- The Ruby publisher walks those documents and renders semantic HTML.
- Tailwind CSS is compiled at publish time from the utilities actually used.
- A complete publish is written to a new slot and activated with an atomic
  symlink swap.
- Storefront requests use the baked disk copy first and fall back to live Ruby
  rendering when a request is genuinely dynamic.
- Catalog, orders, content, and configuration live in SQLite. Uploaded media is
  stored in one local directory.

## Technology stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Application | Ruby 3.4, Roda, Puma | Single-process HTTP application |
| Persistence | SQLite, Sequel | Catalog, content, sessions, and commerce data |
| Admin interactions | Server-rendered HTML, HTMX 2 | Fast commerce management without an SPA backend |
| Visual editor | Instatic, React 19, Vite, Bun | Build-time visual page editing |
| Publisher | Plain Ruby renderers | Pure document-to-HTML rendering |
| Styling | Tailwind CSS 4 standalone | Used-utility-only CSS generated during publish |
| Payments | Stripe Checkout | Hosted payment collection planned for M5 |
| Deployment | Docker, Caddy, Litestream | Planned one-image deployment, TLS, and SQLite backup |

Bun is a development and build dependency only. The intended production image
contains Ruby and the compiled admin assets, not Node or Bun. Fully static
storefront pages contain no publisher JavaScript.

## Current capabilities

- Visual page load, edit, save, and publish loop
- Atomic static-site baking with hashed CSS bundles
- Tailwind utilities, responsive variants, and arbitrary values
- Product and variant administration
- Ordered collections with drag-and-drop membership
- Sanitized rich-text product descriptions
- Permanent redirects for renamed product and collection slugs
- Product and variant CSV import
- Media upload and management
- Session authentication and first-admin setup

See [MILESTONES.md](MILESTONES.md) for detailed progress and
[VISION.md](VISION.md) for the product principles and scope.

## Repository layout

```text
dukafy/                  Ruby application
  db/migrations/         SQLite schema migrations
  models/                Sequel models
  routes/                Admin API, commerce admin, and storefront routes
  publisher/             Pure Ruby page renderer and module registry
  services/              Baking, publishing, imports, and support services
  spec/                  Minitest suite and golden publisher tests
  published/             Generated storefront output (ignored)
  uploads/               Merchant media (ignored)
instatic/                Local visual-editor working copy (ignored by Git)
docs/                    Architecture and workflow documentation
bin/dev                  One-command development launcher
```

`instatic/` is intentionally excluded from this Git repository. Provide the
local editor checkout before running development or editor builds. The
provenance and initial vendoring process are documented in [SETUP.md](SETUP.md).

## Requirements

- Ruby 3.4+
- Bundler
- Bun 1.3+
- Linux x86-64 for the automatic Tailwind standalone binary installer

## Local setup

Install Ruby dependencies:

```bash
cd dukafy
bundle install
cd ..
```

Install editor dependencies after placing the editor in `instatic/`:

```bash
cd instatic
bun install
cd ..
```

Create an initial administrator if you do not want to use the browser setup
flow:

```bash
cd dukafy
ADMIN_EMAIL=owner@example.com \
ADMIN_PASSWORD='replace-with-a-long-password' \
bundle exec ruby scripts/seed_admin.rb
cd ..
```

Populate a development database with 12 products, 20 variants, and three
ordered collections:

```bash
cd dukafy
bundle exec ruby scripts/seed_demo_store.rb
cd ..
```

The demo seed is idempotent, so it is safe to run again.

## Run development

Start Ruby and the visual editor together:

```bash
./bin/dev
```

The command installs the pinned Tailwind compiler when needed, runs database
migrations, and starts both processes:

- Visual editor: <http://localhost:5173/admin/>
- Ruby storefront and commerce admin: <http://localhost:9292/>
- Commerce admin: <http://localhost:9292/admin/store>

Stop both processes with `Ctrl-C`.

## Product CSV import

Open **Store → Products → Import CSV**. The import supports multiple variants
per product and updates existing records by product slug and SKU. Imports are
transactional: one invalid row rolls back the entire file.

The complete format and example are in [docs/csv-import.md](docs/csv-import.md).

## Tests and builds

Run the Ruby suite:

```bash
cd dukafy
bundle exec rake test
```

Build the visual editor:

```bash
cd instatic
bun run build
```

## Publishing model

Publishing renders every published page into a staging slot, compiles only the
Tailwind classes found in the rendered markup, emits content-hashed CSS, and
then atomically points `published/current` at the completed slot. Visitors
therefore never observe a half-written release.

The output under `dukafy/published/current/` is portable static HTML and CSS.
Cart, checkout, and other personalized functionality will use small HTMX
fragments rather than turning the storefront into a client-rendered app.

## Project status

Dukafy is under active development and is not yet ready to process production
orders. The publisher foundation and core catalog admin are functional. Cart,
checkout, hardened production deployment, backup automation, and the final
commerce canvas modules remain on the milestone plan.

## Attribution

The visual editing experience is derived from
[Instatic](https://github.com/corebunch/instatic), © David Babinec, licensed
under the MIT License. Dukafy keeps the editor as a separate local working copy
and reimplements the required server contract in Ruby.
