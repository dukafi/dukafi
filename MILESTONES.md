# Dukafi — Milestones

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

Current launch milestones: [M11 AI provider core](docs/milestones/m11-ai-provider-core/README.md),
[M12 image generation](docs/milestones/m12-image-generation/README.md),
[M13 theme marketplace](docs/milestones/m13-theme-marketplace/README.md),
[M14 provider seams](docs/milestones/m14-provider-seams/README.md),
[M15 replicas and storage](docs/milestones/m15-replicas-and-storage/README.md), and
[M16 launch and deploy](docs/milestones/m16-launch-deploy/README.md).

Ordering rule: milestones are sequential; tasks within a milestone can be
parallelized unless marked (dep: ...). Every milestone ends with a DEMO — a
concrete thing you can click. If the demo can't be shown, the milestone isn't done.

---

## M0 — Foundation (scaffold + vendored editor)

Goal: repo exists, editor builds, Ruby app boots, schema contract exported.

- [x] Execute SETUP.md end to end
- [x] Editor compiles after AI/plugin-host pruning (`bun run build` exits 0)
- [x] Ruby app boots; migrations 001–008 apply on a fresh DB
- [x] `scripts/export-schemas.ts` writes JSON Schemas to `dukafi/publisher/schemas/`
- [x] `Page#document=` validates against schema via json_schemer (spec proves a
      malformed tree is rejected)
- [x] Purity spec: nothing in `publisher/` references DB/File/Net
- [x] CI (GitHub Actions): `bundle exec rake test` + `bun run build` on push

**DEMO:** `./bin/dev` → editor UI loads at :5173/admin, Ruby health/API answers
on :9292, and both processes stop together with Ctrl-C.

---

## M1 — Editor talks to Ruby (load/save loop)

Goal: the vendored editor persists documents to SQLite through the Ruby API.

- [x] Catalogue the editor's API surface: grep `dukafi-editor/src/admin` for fetch
      calls; write `docs/api-contract.md` listing every endpoint + payload shape
      the editor actually uses (cross-check against `reference/instatic`)
- [x] Auth: `POST /admin/api/auth/login`, session cookie, `GET /admin/api/auth/me`;
      bcrypt against `admins`; seed script for first admin
- [x] Site/document endpoints: load site shell + page document, save draft
      document (validate → write `pages.document`)
- [x] Page CRUD: list, create (with starter document), rename, delete, slug edit
- [x] Enforce editor-compatible page slugs on the Ruby model; migrate legacy
      underscore-prefixed Product/Collection template slugs (migration 015)
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

- [x] Canvas (React) + publisher (Ruby) pairs, each with golden tests:
  - [x] `store.price` (variant-aware, currency formatting)
  - [x] `store.variant-picker`
  - [x] `store.buy-button` (posts to cart fragment endpoint)
  - [x] `store.relationship-loop` (generalized `store.collection-loop`: same
        round-robin/pagination mechanism, but `relationship: "products" |
        "variants"` instead of collection-only — walks a collection's
        products or a product's own variants with a freeform child subtree)
  - [x] `store.stock-badge` — ALWAYS a fragment (dynamic_map)
  - [x] `store.cart-badge` — ALWAYS a fragment
- [x] **Revised after M4**: `store.product-card` and `store.image-gallery`
      were replaced by a composable scaffold — a plain `base.container`/
      `base.link` wrapping bound `base.image`/`base.text` children (the same
      `dynamicBindings`/`currentEntry` mechanism the product title already
      used), inserted via new "Insert product"/"Insert collection"/"Insert
      variant list" picker items instead of one opaque card component. Both
      retired modules (plus the original `store.collection-loop` id) stay
      registered and render correctly for already-published documents, but
      are hidden from the module picker for new inserts.
- [x] Loop prefetch: bake.rb resolves collection items into plain hashes before
      render (walker stays pure/synchronous)
- [x] Product-page template: one template document + per-product data binding
      (`currentEntry.title` etc.); bake every published product to
      `/products/<slug>.html`
- [x] Collection pages baked to `/collections/<slug>.html`; page 1 baked,
      `?loop_x_page=N` renders live (cache in M6)
- [x] `dependency_tracker.rb`: record page_path ⇄ product_id during bake
- [x] Partial re-bake: product save re-bakes its page + containing collection
      pages only (spec: editing 1 of 500 products re-bakes ≤ N pages)
- [x] Media variants: resize on upload (libvips via image_processing gem),
      `srcset` emission in image modules

**DEMO:** 500-product seed; edit one product; publish completes in well under a
second; storefront shows the change; unrelated pages untouched (mtime check).

---

## M5 — Cart + checkout (HTMX, never baked)

Goal: money moves.

- [x] Session cart model (cart + cart_items tables; anonymous by session id)
- [~] Fragment endpoints (`routes/fragments.rb`): cart badge and add-to-cart are
      implemented; cart drawer and remove/update-qty remain
- [x] `hx-trigger="revealed"` skeleton pattern for baked-page fragments
- [~] Stock check is implemented at add-to-cart; transactional checkout-time
      recheck remains
- [x] Discount codes: percentage + fixed, validity window, usage limit
      (`DiscountLookup` + session-held code + `CreateOrder` burns a use in the
      same transaction as the stock decrement — but no way to CREATE one
      outside a Ruby console; see M9)
- [ ] Checkout flow (`routes/checkout.rb`, server-rendered): address → shipping
      choice (flat/manual rates v1) → Stripe Checkout redirect
- [ ] Stripe webhook: payment success → create `orders` + `order_items`,
      decrement stock, clear cart (idempotent by event id)
- [ ] Order confirmation page + email (plain SMTP via `mail` gem)
- [ ] Orders admin screen: list, detail, status (paid → fulfilled → shipped),
      refund via Stripe API
- [~] Migrations: carts/cart_items are implemented in migration 014; orders,
      order_items, addresses, and discounts remain

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

## M7 — One-click deploy (the Instatic promise; superseded by M15/M16)

Goal: a non-technical founder gets a live store in ~2 minutes.

- [x] Production Dockerfile: multi-stage — stage 1 Bun builds the editor,
      stage 2 Ruby slim image with app + built assets; final image has NO node
- [x] compose.prod.yml (app + volume) and compose.caddy.yml (TLS variant) — M16
- [x] First-boot owner setup plus optional starter-theme prompt — M13/M16
- [x] Env contract documented in `.env.example`; provider credentials stay in
      encrypted dashboard settings — M11/M14/M16
- [x] Health endpoint (`/admin/api/health`: DB and runtime status)
- [ ] Railway template (Dockerfile deploy, volume mounted for db+uploads+published,
      healthcheck wired) — publish the template
- [ ] Fly.io + generic-VPS guides (`docs/deployment/`)
- [x] In-app update path documented (pull new image, migrations run on boot) — M16
- [x] Starter theme: polished default store (home, collection, product, cart,
      about, 404) shipped as seed documents so the first boot isn't blank

Railway template publication remains an operator-account release step tracked in
`docs/milestones/m16-launch-deploy/railway-template-checklist.md`. Fly.io was moved
out of the 1.0 scope; Compose+Caddy is the generic VPS deployment path.

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

## M9 — Promotions: coupons, discounts, campaigns

Goal: a merchant can run a sale without a developer, and the storefront tells
the truth about it at every moment.

Where this starts from: **discount codes already work end to end at runtime.**
`Discount` + `DiscountLookup` evaluate a code purely (half-up rounding, capped
at the subtotal), `routes/fragments.rb` holds the applied code in the session,
and `CreateOrder` increments `usage_count` inside the same transaction as the
stock decrement. What does not exist is any way to create a code without a Ruby
console — no admin screen, no admin route, no MCP tool. Track A is therefore
mostly surface, not mechanism.

**The constraint that shapes everything else:** a code works today because it is
applied in an HTMX fragment, which is dynamic by construction. A *campaign* —
"20% off this weekend", a sale badge, a struck-through price — wants to appear
on a **baked** page, and a baked page does not know what time it is. Three ways
out, and the choice is not free:

  (a) rebake at the boundary — needs a scheduler, which this repo has none of
      (no `Thread.new`, no cron, nothing)
  (b) put it in a fragment — no rebake, but an extra request per page, and the
      price a crawler sees is then not the price a customer sees
  (c) bake both branches and switch client-side — leaks an unannounced sale
      into the page source, and breaks with JS off

Take (a). A sale price that is in the baked HTML is the one Google indexes and
the one that survives with scripting disabled. Fragments stay for the cart.

### Track A — finish coupons (surface, not mechanism)

- [ ] Discounts admin section: paginated table + create/edit sheet, matching
      Products (code, kind, value, starts/ends, usage limit)
- [ ] Admin API routes behind a shared writer service, so admin and MCP cannot
      drift — the mistake `CommerceWrites` was extracted to prevent
- [ ] MCP tools: `list_discounts`, `create_discount`, `update_discount`,
      `delete_discount` (writes, scope-gated like the rest)
- [ ] **Migration: `orders.discount_code`.** Orders record `discount_cents` but
      not WHICH code produced it, so "how did WEEKEND20 do" is unanswerable
      today. Nothing else in M9 or M10 can attribute revenue without this.
- [ ] Deleting a code that has been redeemed deactivates it instead, so past
      orders keep pointing at something real

### Track B — rules worth having

- [ ] Extract rule evaluation out of `DiscountLookup` so a code and a campaign
      compute an amount off through the same path
- [ ] Minimum spend · per-customer limit · first-order-only
- [ ] Scope: whole cart · one collection · one product
- [ ] `free_shipping` as a third kind (dep: shipping rates, M5)

### Track C — campaigns (the baked-page half)

- [ ] `variants.compare_at_cents` — without it "was 8,000, now 6,400" cannot
      be rendered at all
- [ ] `campaigns` table: window, rule, and DISPLAY (badge text, banner copy) —
      a campaign differs from a code precisely in that it shows itself
- [ ] Applied automatically at cart time, no code entered
- [ ] Scheduler: an in-process timer that rebakes affected paths at the start
      and end boundary, and on boot catches up on any boundary crossed while
      the process was down
- [ ] Publisher: campaign facts on the product entry (`onSale`, `saleBadge`,
      `compareAtDisplay`) so an existing card binds and `visibleWhen`s them —
      the same mechanism reviews' `stars` use, no new module
- [ ] Editor: declare them in `entitySchema.ts` and preview them on canvas, or
      the binding picker will not offer what the renderer can fill

**DEMO:** create WEEKEND20 in the dashboard and watch it come off the cart
total; schedule a campaign to start two minutes from now, touch nothing, and
watch the storefront rebake itself — badge on, price struck through — then end
on its own.

---

## M10 — Analytics: what the store is actually doing

Goal: answer "did that work?" without sending a single visitor to a third
party.

Analytics here splits into two halves that are nothing alike, and conflating
them is how this goes wrong:

**Exact** — revenue, orders, AOV, units, top products, cart abandonment,
discount performance. All of it is SQL over tables that already exist. No new
collection, no privacy question, no beacon, no consent banner. The chart
primitives are already built and unused (`Sparkline`, `Bars`, `StackedBar`,
`StatValue` in the editor's UI kit).

**Approximate** — views, referrers, top pages. This needs a beacon, because M6
puts Caddy in front of `published/current`: Ruby never sees most page requests,
so there is no log to count. Anything claiming otherwise would be counting the
few requests that happened to miss the static path.

Ship the exact half first. It is a week of queries and screens, it is the half
a merchant actually acts on, and it cannot be wrong.

### Track A — the numbers already in the database

- [ ] Overview screen: revenue · orders · AOV · units, with a period selector
      and a sparkline per figure
- [ ] Top products and collections by revenue, not by units — they rank
      differently and the revenue ranking is the one that pays
- [ ] Cart abandonment: carts holding items with no order, older than N
- [ ] Discount performance: redemptions, revenue attributed (dep: M9 Track A's
      `orders.discount_code`)
- [ ] One service, one endpoint, one screen — resist a per-figure route

### Track B — traffic, without tracking anyone

- [ ] Intake endpoint + a one-line beacon baked into pages, behind a setting;
      off means the beacon is absent from the HTML entirely, not disabled in it
- [ ] No cookies. Uniques via a hash of IP + UA + a salt that rotates daily and
      is discarded — yesterday's visitors cannot be re-identified, by us or by
      anyone who takes the database
- [ ] Honour DNT and Global Privacy Control
- [ ] Bot filtering (UA list + the no-JS check the beacon gives for free)
- [ ] Nightly rollup into `daily_stats`; raw rows expire after N days, or a
      SQLite file on a Railway volume grows without bound
- [ ] `?ref=` / UTM captured as a dimension, never as anything per-person

### Track C — the two halves together

- [ ] Conversion rate: orders ÷ sessions
- [ ] Campaign attribution: views and revenue inside the window against the
      equivalent window before it (dep: M9 Track C)

**DEMO:** open the dashboard and read yesterday's revenue and best sellers;
load the storefront in a private window and watch the view land within a
minute; run last week's campaign report and see what it earned.

### Deliberately not in M10

Third-party analytics of any kind, user-level tracking or session replay, a
funnel builder, A/B testing, email marketing. Each is a product; this milestone
is a scoreboard.

---

## M11–M16 — Launch milestones (September 2026)

The launch gap analysis and the six milestones that close it live under
`docs/LAUNCH-PLAN.md` (decisions D1–D12, dependency order, launch checklist) with one
spec each in `docs/milestones/m11-*` … `m16-*`:

- M11 — AI provider core: driver registry, multiple BYOK connections, capability model
  (the core is fully usable with zero AI; Dukafi AI harness stays optional/v2)
- M12 — Image generation with cross-provider fallback + `p.image_provider` seam
- M13 — Theme marketplace: registry `/v1/themes/*`, bundled starter theme, in-app gallery
- M14 — Provider seams: `p.mail_provider` + SMTP plugin + order emails, plugin job
  scheduler (leader-elected), `p.shipping_provider` + flat rate
- M15 — Replicas & storage: compose scale-out with shared volume + migrator service
  (Tier 1); media storage adapter + DB-backed published store (Tier 2 fast-follow)
- M16 — Launch & deploy: Railway template + Deploy button, compose overlays,
  `.env.example`, first-run theme flow, README/docs rewrite, v1.0.0 release checklist

Several M7 items are superseded by M15/M16; M16 task 11 reconciles them here.

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
