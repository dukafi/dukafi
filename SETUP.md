# Dukafy — Project Setup Instructions (for coding agent)

Execute these steps in order. Do not skip verification steps. Stop and report if any
verification fails.

Dukafy is a self-hosted, ecommerce-only visual CMS: Ruby + SQLite + HTMX backend,
with a visual editor vendored from Instatic (MIT). Read `VISION.md` for the product
goal and `MILESTONES.md` for the task plan before writing feature code.

---

## 0. Prerequisites

Install the toolchain via mise (manages Ruby and Bun side by side):

```bash
curl https://mise.run | sh
mise use -g ruby@3.4 bun@latest
ruby --version   # expect 3.4.x
bun --version    # expect 1.x
```

If mise is unavailable, any method giving Ruby 3.4+ and Bun 1.x is acceptable.
Bun is a BUILD-TIME dependency only (editor bundling). The runtime product is
pure Ruby + SQLite.

Install libvips for responsive media processing:

```bash
sudo apt-get install libvips        # Debian/Ubuntu
# or: brew install vips             # macOS
```

---

## 1. Create the repo

```bash
mkdir dukafy-project && cd dukafy-project
git init
printf "db/*.sqlite3\npublished/\nuploads/\npublic/admin/\nnode_modules/\n.env\n" > .gitignore
```

---

## 2. Vendor the Instatic editor into `instatic/`

```bash
git clone --depth 1 https://github.com/corebunch/instatic.git /tmp/instatic-src

mkdir instatic
cp -r /tmp/instatic-src/src            instatic/src
cp    /tmp/instatic-src/index.html     instatic/
cp    /tmp/instatic-src/vite.config.ts instatic/
cp    /tmp/instatic-src/tsconfig.json  instatic/
cp    /tmp/instatic-src/tsconfig.app.json  instatic/ 2>/dev/null || true
cp    /tmp/instatic-src/tsconfig.node.json instatic/ 2>/dev/null || true
cp    /tmp/instatic-src/package.json   instatic/
cp    /tmp/instatic-src/bun.lock       instatic/ 2>/dev/null || true
cp    /tmp/instatic-src/LICENSE        instatic/LICENSE          # REQUIRED — MIT attribution
cp -r /tmp/instatic-src/docs           instatic/docs             # keep as reference
cp -r /tmp/instatic-src/vendor         instatic/vendor 2>/dev/null || true  # pixel icons
```

Also copy `/tmp/instatic-src/server` to `reference/instatic-server/` (read-only
reference — we re-implement its API in Ruby; NEVER run it, NEVER import from it):

```bash
mkdir -p reference
cp -r /tmp/instatic-src/server reference/instatic-server
echo "Reference only. Do not run or import. See dukafy/routes/admin_api.rb for the Ruby reimplementation." > reference/README.md
```

### 2.1 Prune what Dukafy does not use (v1)

```bash
rm -rf instatic/src/admin/ai
rm -rf instatic/src/admin/plugin-host-hooks
rm -rf instatic/src/admin/plugin-host-ui
rm -f  instatic/src/admin/pluginRuntimeBootstrap.ts
```

### 2.2 Repair the build

```bash
cd instatic && bun install && bun run build || true
```

The build WILL fail after pruning — the router, some panels, and bootstrap code
import the deleted AI/plugin-host modules. Fix forward:

- Remove imports/usages of the deleted modules (router entries, panel tabs,
  bootstrap calls). Prefer deleting the referencing UI (AI panel button, plugin
  admin pages) over stubbing.
- Do NOT modify `src/core/` type definitions in this step — they are the
  document-format contract.
- Iterate `bun run build` until it exits 0. Commit as
  `vendor: instatic editor, pruned (ai, plugin host)`.

### 2.3 Point the build at Dukafy

Edit `instatic/vite.config.ts` (adjust, don't blindly replace — keep their plugins):

```ts
export default defineConfig({
  base: "/admin/",
  build: { outDir: "../dukafy/public/admin", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/admin/api": "http://localhost:9292" },
  },
  // ...retain existing plugins/resolve config
})
```

**Verify:** `bun run build` exits 0 and `dukafy/public/admin/index.html` exists
(create `dukafy/public` first if needed, or run after step 3).

---

## 3. Scaffold the Ruby app in `dukafy/`

Create this exact tree (empty `.keep` files where noted):

```bash
cd .. && mkdir -p dukafy && cd dukafy
mkdir -p config db/migrations models routes publisher/modules publisher/schemas \
         services views/layouts views/checkout views/account \
         public/js published uploads \
         spec/golden spec/publisher spec/routes scripts
touch published/.keep uploads/.keep public/admin/.keep spec/golden/.keep
```

### 3.1 Gemfile

```ruby
source "https://rubygems.org"

gem "roda"
gem "sequel"
gem "sqlite3"
gem "phlex"
gem "puma"
gem "json_schemer"
gem "bcrypt"
gem "rack-session"
gem "stripe"

group :development do
  gem "rerun"
  gem "foreman"
end

group :test do
  gem "minitest"
  gem "rack-test"
end
```

Run `bundle install`.

### 3.2 config/database.rb

```ruby
require "sequel"

DB = Sequel.sqlite(ENV.fetch("DUKAFY_DB", File.expand_path("../db/dukafy.sqlite3", __dir__)))
DB.run "PRAGMA journal_mode = WAL"
DB.run "PRAGMA synchronous = NORMAL"
DB.run "PRAGMA busy_timeout = 5000"
DB.run "PRAGMA foreign_keys = ON"
DB.run "PRAGMA cache_size = -64000"
Sequel::Model.db = DB
Sequel::Model.plugin :timestamps, update_on_create: true
Sequel.extension :migration
```

### 3.3 config/environment.rb

```ruby
require_relative "database"
Dir[File.expand_path("../models/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../publisher/**/*.rb", __dir__)].sort.each { |f| require f }
Dir[File.expand_path("../services/*.rb", __dir__)].sort.each { |f| require f }
```

### 3.4 app.rb (skeleton)

```ruby
require_relative "config/environment"
require "roda"

class Dukafy < Roda
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }
  plugin :json
  plugin :json_parser
  plugin :public            # serves public/ (built editor at /admin)
  plugin :halt

  route do |r|
    r.public

    r.on("admin") do
      r.on("api") { r.run AdminApi }        # routes/admin_api.rb
      # non-API /admin/* → serve the built editor SPA shell
      r.get { File.read(File.expand_path("public/admin/index.html", __dir__)) rescue r.halt(404) }
    end

    r.on("fragments") { r.run Fragments }   # routes/fragments.rb  (HTMX)
    r.on("checkout")  { r.run Checkout }    # routes/checkout.rb

    # storefront: Layer A disk fast-path, then live render fallback
    r.run Storefront                        # routes/storefront.rb
  end
end
```

Create `config.ru`:

```ruby
require_relative "app"
run Dukafy.freeze.app
```

Create minimal placeholder route classes in `routes/` (`AdminApi`, `Fragments`,
`Checkout`, `Storefront`) — each a Roda subclass returning 501 for now — so the
app boots.

### 3.5 config/puma.rb

```ruby
workers 0          # single process — coherent in-memory cache, one SQLite writer
threads 5, 5
port ENV.fetch("PORT", 9292)
```

### 3.6 First migrations (`db/migrations/`)

Create, in this order (Sequel migration format, `Sequel.migration { change { ... } }`):

1. `001_admins.rb` — id, email (unique), password_digest, created_at, updated_at
2. `002_media_assets.rb` — id, path, mime, width, height, variants_json (text), created_at
3. `003_pages.rb` — id, slug (unique), title, kind (text: 'page'|'template'),
   document (text/JSON — the editor's SiteDocument/NodeTree, stored verbatim),
   status (text: 'draft'|'published'), published_document (text, nullable),
   created_at, updated_at
4. `004_products.rb` — id, title, slug (unique), description_document (text/JSON,
   nullable), status, vendor, created_at, updated_at
5. `005_variants.rb` — id, product_id (fk), sku, title, price_cents (integer),
   currency (text, default 'USD'), stock (integer, default 0), position
6. `006_collections.rb` — id, title, slug (unique), description, sort_order
7. `007_collection_products.rb` — collection_id (fk), product_id (fk), position,
   composite unique index
8. `008_page_dependencies.rb` — page_path (text), product_id (fk), unique composite
   index (for partial re-bakes)

Add `scripts/migrate.rb`:

```ruby
require_relative "../config/database"
Sequel::Migrator.run(DB, File.expand_path("../db/migrations", __dir__))
puts "migrated to #{DB[:schema_migrations].count rescue 'n/a'}"
```

**NOTE:** money is integer cents, always. Never float.

### 3.7 Models

One Sequel model per table in `models/` (Product has many Variants, ordered by
position; Collection many-to-many Products through collection_products; Page
validates presence of slug, parses `document` JSON lazily).

### 3.8 Publisher skeleton (`publisher/`)

Rules for everything in this directory (mirrors Instatic's Constraint #179):

- **PURE**: no DB access, no file IO, no network, no globals. Inputs in, strings out.
- `registry.rb` — `Dukafy::Publisher::REGISTRY = { "base.container" => Modules::Container, ... }`
- Each module in `publisher/modules/` implements
  `def self.render(props, rendered_children) -> { html:, css: }` where props are
  already-escaped plain hashes and rendered_children is an array of HTML strings.
- `render_page.rb` — `RenderPage.call(document:, registry:, prefetched: {})`:
  bottom-up recursive walk of the node tree (port of Instatic's `renderNode`):
  render children → resolve breakpoint props → escape strings → module render →
  collect CSS deduped by moduleId (`css_collector.rb`).
- `dynamic_map.rb` — a frozen Hash of moduleId → :baked | :fragment. Ecommerce
  classification is HARDCODED (stock badge, cart badge = :fragment; everything
  else :baked). No author toggles.
- HTML escaping: escape at the walker boundary before module render, exactly once.
  URL props go through a `safe_url` helper (reject javascript:, data:text, etc.).

### 3.9 HTMX

```bash
curl -sL https://unpkg.com/htmx.org@2/dist/htmx.min.js -o public/js/htmx.min.js
```

### 3.10 Procfile.dev (in `dukafy/`)

```
web:    bundle exec rerun --dir . --dir ../instatic/src -- rackup -p 9292
editor: sh -c "cd ../instatic && bun run dev"
```

---

## 4. Export the document-schema contract

Create `instatic/scripts/export-schemas.ts`: import the TypeBox schemas that
define the site/page document (locate them under `instatic/src/core/` — search
for `Type.Object` definitions of the SiteDocument / page node tree), serialize
each with `JSON.stringify(schema)` (TypeBox schemas ARE JSON Schema), and write
to `../dukafy/publisher/schemas/<name>.schema.json`.

Run `bun run scripts/export-schemas.ts`. Then in Ruby, `Page#document=` validates
against the schema via `json_schemer` and raises on mismatch.

**This is the single contract between the React editor and the Ruby publisher.
If a document fails validation, the bug is on whichever side changed shape.**

---

## 5. Final verification checklist

Run all; every item must pass before feature work starts:

```bash
cd dukafy
bundle exec ruby scripts/migrate.rb            # migrations apply cleanly
bundle exec rackup -p 9292 &                   # app boots
curl -s -o /dev/null -w "%{http_code}" localhost:9292/admin/api/health   # 501 or 200, not 500
cd ../instatic
bun run build                                  # exits 0
test -f ../dukafy/public/admin/index.html && echo EDITOR_BUILD_OK
```

Then commit: `scaffold: dukafy app + editor wiring`.

Final tree (top level):

```
dukafy-project/
├── .gitignore
├── SETUP.md  VISION.md  MILESTONES.md
├── instatic/            # vendored editor (React/TS) — builds into dukafy/public/admin
├── reference/           # instatic's original Bun server, read-only reference
└── dukafy/              # THE PRODUCT — Ruby + SQLite + HTMX
```

## Standing rules for the agent

1. `instatic/LICENSE` is never deleted. Attribution to Instatic (David Babinec,
   MIT) stays in the repo and in any About screen.
2. `dukafy/publisher/**` stays pure — enforce with a spec that greps for
   `DB`, `Sequel`, `File.`, `Net::` in that directory.
3. Money is integer cents. Stock changes never trigger re-bakes (stock renders
   via HTMX fragments only).
4. Every publisher module gets a golden test: `spec/golden/<module>/props.json`
   + `expected.html`; spec renders and byte-compares.
5. Never modify `instatic/src/core/` types without regenerating schemas (step 4)
   and updating the Ruby side in the same commit.
6. `reference/` is read-only. Port behavior from it; never require or execute it.
