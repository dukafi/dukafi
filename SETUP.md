# Dukafi setup and operations guide

This guide describes the repository as it exists now. It covers a development
installation, database/bootstrap behavior, common commands, local data, and
known limitations. For product intent, read [VISION.md](VISION.md); for exact
progress, read [MILESTONES.md](MILESTONES.md).

## 1. Prerequisites

- Ruby 3.4 or newer
- Bundler matching the lockfile
- Bun 1.x or newer
- libvips, required for uploaded-image dimensions and responsive WebP variants
- Linux x86-64 for automatic installation of the pinned Tailwind standalone
  binary; other platforms can provide their own binary

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install libvips
```

macOS:

```bash
brew install vips
```

Ruby and Bun may be installed with rbenv, mise, asdf, or another tool. Verify:

```bash
ruby --version
bundle --version
bun --version
vips --version
```

## 2. Repository layout: the editor is tracked here

`dukafi-editor/` is a fork of Instatic's React/Vite admin client, tracked as
part of this monorepo. It carries local Dukafi integrations including:

- Vite base path `/admin/`
- proxying `/admin/api` to `http://localhost:9292`
- the Commerce workspace
- Dukafi canvas commerce modules
- API clients matching [docs/api-contract.md](docs/api-contract.md)

A full, unmodified clone of the upstream project is kept separately at
`reference/instatic/` — it has its own `.git` (so it can be `git fetch`-ed to
diff against `dukafi-editor/`), is gitignored, and is never run or imported
into Dukafi.

## 3. Install dependencies

From the repository root:

```bash
cd dukafi
bundle install

cd ../dukafi-editor
bun install

cd ..
```

## 4. Start both applications

```bash
./bin/dev
```

The launcher performs three actions:

1. Runs `dukafi/scripts/install_tailwind.rb`, downloading and checksum-verifying
   the pinned standalone compiler when absent.
2. Runs every unapplied Sequel migration against the configured database.
3. Starts Puma/Roda and Vite together through Foreman.

Expected addresses:

| Surface | URL |
| --- | --- |
| Visual CMS | <http://localhost:5173/admin/> |
| Commerce workspace | <http://localhost:5173/admin/commerce> |
| Public storefront | <http://localhost:9292/> |
| CMS API base | <http://localhost:9292/admin/api/cms> |

The Vite address is the normal development editor entry point. Its API proxy
keeps browser requests on port 5173 while forwarding them to Ruby on port 9292.
Stop both processes with `Ctrl-C`.

The Bundler deprecation printed by `rerun` is emitted by that development gem
and does not prevent Puma from starting.

## 5. First-time setup and development data

If the database has no administrator, the editor shows the setup flow. Supply a
store name, owner email, and password of at least 12 characters.

Alternatively, create the owner from the terminal:

```bash
cd dukafi
ADMIN_EMAIL=owner@example.com \
ADMIN_PASSWORD='replace-with-a-long-password' \
bundle exec ruby scripts/seed_admin.rb
```

Note that `seed_admin.rb` takes the password as an environment variable, which
lands in your shell history. It is fine for seeding a throwaway development
box; it is the wrong tool for a real store.

### Forgotten password

There is no self-service reset — no email flow, no "forgot password" link. A
locked-out owner is recovered from a terminal on the machine (or a shell in the
container), which is the only place that can be trusted without an email
channel to verify against.

```bash
cd dukafi
bundle exec ruby scripts/passwd.rb --list          # which accounts exist
bundle exec ruby scripts/passwd.rb owner@example.com
bundle exec ruby scripts/passwd.rb owner@example.com --generate
bundle exec ruby scripts/passwd.rb shopper@example.com --customer
```

The password is prompted for without echo — never passed as an argument, where
it would sit in shell history and be visible in `ps` to everyone on the box.
Pipe it on stdin with `--stdin --force` for scripting.

In a container:

```bash
docker exec -it dukafi bundle exec ruby scripts/passwd.rb --list
```

Changing a password does **not** end existing sessions — they are signed
cookies, not server-side records. After a suspected compromise, rotate
`SESSION_SECRET` and restart, and revoke any personal access tokens.

Seed the idempotent demo catalog (12 products, variants, and three collections):

```bash
bundle exec ruby scripts/seed_demo_store.rb
```

## 6. Database and migrations

The default database is `dukafi/db/dukafy.sqlite3`. Override it with an absolute
or process-resolvable path:

```bash
DUKAFY_DB=/path/to/store.sqlite3 ./bin/dev
```

SQLite runs in WAL mode with foreign keys, a busy timeout, and a single Puma
worker. Apply migrations manually with:

```bash
cd dukafi
bundle exec ruby scripts/migrate.rb
```

Current migrations cover admins, media, pages, products, variants, collections,
page dependencies, site state/preferences, publish state, redirects, carts, and
cart items. Migration `015_fix_template_slugs.rb` changes legacy
`_product-template` and `_collection-template` records to editor-valid slugs and
updates the slug embedded inside each JSON document.

Page slugs are also validated by Ruby using the same basic rule as the editor:
lowercase letters/numbers, single hyphens inside segments, and optional single
slashes between segments.

## 7. Tailwind CSS

Dukafi pins the Tailwind CSS 4 standalone compiler. The default binary lives at
`dukafi/vendor/tailwindcss` and is ignored by Git.

On unsupported platforms, install a compatible standalone executable and set:

```bash
TAILWINDCSS_BIN=/absolute/path/to/tailwindcss ./bin/dev
```

Tailwind is compiled at publish time from class attributes in rendered pages.
It does not ship every utility. Utilities such as `p-8`, `px-8`, responsive
variants, state variants, and arbitrary values work when they are present in a
published document. See [docs/tailwind.md](docs/tailwind.md).

## 8. Media

Original uploads and generated variants live under `dukafi/uploads/`, which is
ignored by Git. Raster uploads generate WebP variants at widths below the
original from this set: 320, 640, 960, 1280, and 1920 pixels. Metadata and
variant paths are stored in SQLite; image modules emit `srcset` and `sizes`.

If libvips is missing, raster upload processing returns a clear service error.
Install libvips and restart `./bin/dev`. Deleting a media record also deletes
its managed variants.

## 9. Build, tests, and verification

Run all Ruby tests:

```bash
cd dukafi
bundle exec rake test
```

Build the editor:

```bash
cd dukafi-editor
bun run build
```

The build writes production editor assets to `dukafi/public/admin/`, which is
ignored. Useful smoke checks while `./bin/dev` is running:

```bash
curl -i http://localhost:9292/admin/api/health
curl -i http://localhost:9292/
```

After publishing, a storefront response should include
`X-Dukafy-Render: disk`. Collection pagination or another noncanonical query
may return `X-Dukafy-Render: live`.

## 10. Publishing and generated files

Saving and publishing are separate:

- **Save** writes draft site/page state to SQLite.
- **Publish** renders ordinary pages and all active products/collections,
  compiles the used Tailwind classes, writes the inactive output slot, then
  atomically switches `dukafi/published/current`.

Generated output is ignored by Git. The two physical slots are `slot_0` and
`slot_1`; only a completed slot becomes current. A failed publish removes the
incomplete slot and preserves/restores the previous current release.

`DUKAFY_PUBLISHED_ROOT` can move this output:

```bash
DUKAFY_PUBLISHED_ROOT=/absolute/path/to/published ./bin/dev
```

## 11. Catalog and template workflow

Use `/admin/commerce` for product, variant, collection, membership, and CSV
operations. Use the Site workspace for visual layout.

- **Product template** renders every active product at
  `/products/<product-slug>`.
- **Collection template** renders every collection at
  `/collections/<collection-slug>`.
- Store modules with an empty slug property use the current template entry.
- A catalog item must be active and the site must be published before its baked
  storefront URL exists.

See [docs/editor-commerce-workflow.md](docs/editor-commerce-workflow.md) for the
complete authoring flow and module behavior.

## 12. Local state, backup, and reset caution

The important mutable paths are:

- `dukafi/db/dukafy.sqlite3` plus temporary `-wal`/`-shm` files
- `dukafi/uploads/`
- `dukafi/published/` (rebuildable, but useful for immediate static serving)

Production-grade Litestream automation and a restore drill are not implemented
yet. For a consistent manual development backup, stop the server first, then
copy the database and uploads directory. Do not copy only the main SQLite file
while writers are active and ignore the WAL.

Deleting the development database is destructive and removes CMS/catalog/cart
state. The next `./bin/dev` recreates the schema, but not the lost content.

## 13. Troubleshooting

### “Could not load CMS site … Page slug must use …”

Run current migrations and restart:

```bash
cd dukafi
bundle exec ruby scripts/migrate.rb
```

Migration 015 repairs the old built-in template slugs. New invalid slugs are
rejected by the Ruby model before they can poison CMS bootstrap.

### API requests return 502 from port 5173

Vite is running but Ruby is unavailable. Check the `web.1` process in the
`./bin/dev` output and confirm port 9292 is listening.

### API endpoint returns 404

Make sure both sides are from compatible working copies. The editor is local
and ignored by Git, while the Ruby contract is committed. Compare the request
with [docs/api-contract.md](docs/api-contract.md).

### WebSocket on port 5100 fails

Realtime collaboration is not implemented in the Ruby v1 server. The core
save/publish workflow uses HTTP and does not require that collaboration socket.

### Publish button is disabled

Finish initial setup/login, make a saved change, and ensure the CMS loaded
without validation errors. Publish status distinguishes a saved draft from the
currently live version.

### Product URL is missing

Confirm the product status is `active`, the Product template exists, and a
publish completed. Then use port 9292 and the exact slug:
`http://localhost:9292/products/<slug>`.

## 14. Development invariants

- Never use floats for money.
- Do not add DB, filesystem, or network access to `dukafi/publisher/`.
- Keep editor and Ruby module implementations behaviorally aligned.
- Regenerate schemas whenever editor core document types change.
- Treat `reference/` as read-only.
- Preserve Instatic MIT attribution.
- `dukafi-editor/` is tracked and committed like any other part of this repo.
  Do not commit `reference/instatic/`, databases, uploads, generated published
  output, built editor assets, or the local Tailwind executable.
