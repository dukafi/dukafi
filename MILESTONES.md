# Dukafy — Milestones

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

Ordering rule: milestones are sequential; tasks within a milestone can be
parallelized unless marked (dep: ...). Every milestone ends with a DEMO — a
concrete thing you can click. If the demo can't be shown, the milestone isn't done.

---

## M0 — Foundation (scaffold + vendored editor)

Goal: repo exists, editor builds, Ruby app boots, schema contract exported.

- [x] Execute SETUP.md end to end
- [x] Editor compiles after AI/plugin-host pruning (`bun run build` exits 0)
- [x] Ruby app boots; migrations 001–008 apply on a fresh DB
- [x] `scripts/export-schemas.ts` writes JSON Schemas to `dukafy/publisher/schemas/`
- [x] `Page#document=` validates against schema via json_schemer (spec proves a
      malformed tree is rejected)
- [x] Purity spec: nothing in `publisher/` references DB/File/Net
- [x] CI (GitHub Actions): `bundle exec rake test` + `bun run build` on push

**DEMO:** `foreman start` → editor UI loads at :5173/admin (API calls 501),
storefront answers on :9292.

---

## M1 — Editor talks to Ruby (load/save loop)

Goal: the vendored editor persists documents to SQLite through the Ruby API.

- [x] Catalogue the editor's API surface: grep `instatic/src/admin` for fetch
      calls; write `docs/api-contract.md` listing every endpoint + payload shape
      the editor actually uses (cross-check against `reference/instatic-server`)
- [x] Auth: `POST /admin/api/auth/login`, session cookie, `GET /admin/api/auth/me`;
      bcrypt against `admins`; seed script for first admin
- [x] Site/document endpoints: load site shell + page document, save draft
      document (validate → write `pages.document`)
- [x] Page CRUD: list, create (with starter document), rename, delete, slug edit
- [x] Media endpoints: upload to `uploads/`, list, delete; store row in
      `media_assets` (variants deferred to M4)
- [x] Trim editor features that call endpoints we won't ship in v1 (site transfer,
      spotlight actions touching missing APIs) — delete the UI, don't stub 500s
- [x] Error contract: consistent JSON error envelope; editor surfaces failures

**DEMO:** log into the editor, drag a container + text onto the canvas, hit
save, restart Ruby, reload — the edit is still there (read it back out of
SQLite by hand to prove it).

---

## M2 — Ruby publisher core (the bake loop)

Goal: a saved document becomes a static HTML file on disk, served fast.

- [x] `render_page.rb` walker: bottom-up recursion, breakpoint prop resolution,
      escape-at-boundary, module dispatch via registry
- [x] `css_collector.rb`: dedupe by moduleId; assemble reset + framework +
      module + page CSS; hash-named bundle files
- [x] Port Instatic's reset CSS + a minimal framework CSS (tokens as CSS vars)
- [x] Phlex/plain-Ruby modules with golden tests: `base.container`, `base.text`,
      `base.image`, `base.button`, `base.link`, `base.list`
- [x] Visual parity pass: rendered output vs editor canvas for the same document
      (manual first; screenshot-diff harness is M8)
- [x] `services/bake.rb`: render every published page → `published/slot_x/` →
      atomic symlink flip of `published/current` → bump publish_version
- [x] `routes/storefront.rb`: disk fast-path (`published/current/<path>.html`
      when canonical query is empty) → live render fallback → 404 page
- [x] Publish endpoint: `POST /admin/api/publish` runs the bake; editor's publish
      button wired to it
- [x] Junk-param canonicalization (utm_* etc. collapse to bare path → disk hit)

**DEMO:** build a landing page in the editor, click Publish, open the site in a
fresh browser: view-source shows clean HTML + hashed CSS links, zero JS, and the
response is served off disk (log line proves no render happened).

---

## M3 — Commerce data + admin screens (fixed tables)

Goal: merchants manage a real catalog without touching the canvas.

- [x] Product CRUD screens inside the authenticated Instatic Commerce workspace
      (the storefront host exposes no separate merchant administration UI)
- [x] Variants: inline editor per product (sku, price_cents, stock, position)
- [x] Collections CRUD + drag-order product membership
- [x] Product description as an editor document (reuse the canvas for rich
      product content) OR rich-text field for v1 — decide, record in VISION.md
- [x] Slug uniqueness + redirect table for renamed slugs
- [x] CSV import for products/variants (merchant onboarding path)
- [x] Seed script: demo store (12 products, 3 collections) for dev/demo

**DEMO:** import the seed CSV, edit a price, reorder a collection — all through
the admin UI.

---

## M4 — Commerce modules on the canvas

Goal: the editor builds real store pages.

- [ ] Canvas (React) + publisher (Ruby) pairs, each with golden tests:
  - [x] `store.product-card` (image, title, price)
  - [x] `store.price` (variant-aware, currency formatting)
  - [x] `store.image-gallery`
  - [x] `store.variant-picker`
  - [x] `store.buy-button` (posts to cart fragment endpoint)
  - [ ] `store.collection-loop` (port of base.loop, source = collection,
        round-robin variants, pagination param `loop_<id>_page`)
  - [ ] `store.stock-badge` — ALWAYS a fragment (dynamic_map)
  - [ ] `store.cart-badge` — ALWAYS a fragment
- [ ] Loop prefetch: bake.rb resolves collection items into plain hashes before
      render (walker stays pure/synchronous)
- [ ] Product-page template: one template document + per-product data binding
      (`currentEntry.title` etc.); bake every published product to
      `/products/<slug>.html`
- [ ] Collection pages baked to `/collections/<slug>.html`; page 1 baked,
      `?loop_x_page=N` renders live (cache in M6)
- [ ] `dependency_tracker.rb`: record page_path ⇄ product_id during bake
- [ ] Partial re-bake: product save re-bakes its page + containing collection
      pages only (spec: editing 1 of 500 products re-bakes ≤ N pages)
- [ ] Media variants: resize on upload (libvips via image_processing gem),
      `srcset` emission in image modules

**DEMO:** 500-product seed; edit one product; publish completes in well under a
second; storefront shows the change; unrelated pages untouched (mtime check).

---

## M5 — Cart + checkout (HTMX, never baked)

Goal: money moves.

- [x] Session cart model (cart + cart_items tables; anonymous by session id)
- [ ] Fragment endpoints (`routes/fragments.rb`): cart badge, cart drawer,
      add/remove/update-qty — all HTMX swaps, no full page loads
- [ ] `hx-trigger="revealed"` skeleton pattern for baked-page fragments
- [ ] Stock check at add-to-cart and again at checkout (race-safe: single
      SQLite writer + transaction)
- [ ] Discount codes: percentage + fixed, validity window, usage limit
- [ ] Checkout flow (`routes/checkout.rb`, server-rendered): address → shipping
      choice (flat/manual rates v1) → Stripe Checkout redirect
- [ ] Stripe webhook: payment success → create `orders` + `order_items`,
      decrement stock, clear cart (idempotent by event id)
- [ ] Order confirmation page + email (plain SMTP via `mail` gem)
- [ ] Orders admin screen: list, detail, status (paid → fulfilled → shipped),
      refund via Stripe API
- [ ] Migrations: carts, cart_items, orders, order_items, addresses, discounts

**DEMO:** full purchase on the demo store with a Stripe test card; order appears
in admin; stock decremented; cart badge updated everywhere without a re-bake.

---

## M6 — Performance layer + hardening

Goal: Instatic's three-layer speed story, in Ruby, under load.

- [ ] Layer B render cache: SQLite table `render_cache(key, version, html)` or
      in-process hash (single worker) — keyed (path, canonical_query),
      invalidated by publish_version bump
- [ ] Single-flight guard on cache misses (Mutex per key)
- [ ] Cache headers: immutable 1y on hashed CSS/assets; no-cache on HTML
- [ ] Optional Caddy config: `try_files` straight into `published/current` so
      Ruby is out of the static hot path entirely; `Caddyfile` in repo
- [ ] Load test (oha/wrk): baked page p99 < 5ms via Ruby, < 1ms via Caddy;
      fragment endpoints p99 < 30ms on seed store
- [ ] Security pass: CSP on baked pages (port Instatic's plan-as-data approach),
      CSRF on all fragment POSTs, rate limit login + checkout, `safe_url` audit,
      `</style` neutralization in collected CSS, path traversal check on
      published/ + uploads/ serving
- [ ] Litestream config for continuous SQLite backup; restore drill documented
- [ ] Backup story: DB file + uploads/ = whole site (script + doc)

**DEMO:** load-test numbers in the README; kill the DB mid-traffic → baked
pages still serve; restore from Litestream works.

---

## M7 — One-click deploy (the Instatic promise)

Goal: a non-technical founder gets a live store in ~2 minutes.

- [ ] Production Dockerfile: multi-stage — stage 1 Bun builds the editor,
      stage 2 Ruby slim image with app + built assets; final image has NO node
- [ ] compose.prod.yml (app + volume) and compose.caddy.yml (TLS variant)
- [ ] First-boot wizard: no admins row → /setup flow (store name, currency,
      admin account, optional Stripe keys) → seeds starter theme pages
- [ ] Env contract: PORT, SESSION_SECRET (auto-generate if absent + persist),
      DUKAFY_DB, STRIPE_KEY/WEBHOOK_SECRET, SMTP_*; document in .env.example
- [ ] Health endpoint (`/healthz`: DB reachable, published/current resolves)
- [ ] Railway template (Dockerfile deploy, volume mounted for db+uploads+published,
      healthcheck wired) — publish the template
- [ ] Fly.io + generic-VPS guides (`docs/deployment/`)
- [ ] In-app update path documented (pull new image, migrations run on boot)
- [ ] Starter theme: polished default store (home, collection, product, cart,
      about, 404) shipped as seed documents so the first boot isn't blank

**DEMO (the money demo):** stopwatch from clicking the Railway button to adding
a product and buying it with a test card. Target: under 5 minutes, zero terminal.

---

## M8 — Quality + release

- [ ] Screenshot-diff harness: for each module, render golden props in (a) the
      editor canvas (Playwright against Vite) and (b) baked Ruby HTML; pixel-diff
      with threshold — catches canvas/publisher drift automatically
- [ ] E2E suite (Playwright): login → build page → publish → buy → order in admin
- [ ] SEO pass: meta/OG per page + product structured data (JSON-LD Product/Offer),
      sitemap.xml baked on publish, canonical URLs
- [ ] 404 + error pages designed in the editor, baked (404.html convention)
- [ ] Docs: merchant quickstart, developer guide (adding a module pair),
      api-contract.md finalized
- [ ] License/attribution audit (Instatic MIT notice present in repo + About)
- [ ] Tag v0.1.0; changelog; demo store deployed publicly

---

## Post-1.0 parking lot (do NOT start early)

- Dynamic tables (`data_tables`/`data_rows` port) as the plugin storage layer
- Plugin system: manifest + sandboxed execution + module SDK (canvas+publisher pair contract)
- Multi-currency, tax engines (VAT/Stripe Tax), real shipping-rate providers
- Customer accounts + order history (guest checkout is v1)
- AI agent on the canvas (Instatic-style, provider-agnostic)
- Multi-store / multi-tenant mode
- Search (SQLite FTS5 over products), product reviews module
- Postgres adapter (only if a real customer forces it)
