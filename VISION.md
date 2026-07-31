# Dukafy — Vision

**Own your store. One click to live.**

Dukafy is a self-hosted, ecommerce-only visual CMS. One Ruby server holds the
visual editor, the catalog, the cart, checkout, media, and the publisher. You
deploy it with one click, and what it ships to your customers is plain semantic
HTML and compact CSS — pages fast enough to feel instant and clean enough to
read in view-source.

Instatic proved the shape: one server, canvas editor in, static files out,
dynamic islands only where reality demands them. Dukafy takes that shape and
bets it even narrower: **commerce only.** No generic content modeling, no
build-anything ambition. Every feature exists to help one person sell things
online without renting their store from a platform.

---

## The problem

Opening an online store today means choosing your dependency:

- **Hosted platforms** (Shopify and friends): fast to start, but you rent
  forever — transaction fees, app-store taxes, locked-in themes, and a store
  you can never take with you.
- **WooCommerce-style stacks**: you "own" it, but it's a framework fed by a
  dozen plugins, each a bill, an update, and a security hole.
- **Headless commerce**: maximum ownership, maximum assembly — a CMS, a
  storefront framework, a cart API, a host, and a developer on retainer.

The person with 40 products and good taste is served worst by all three.

## The bet

A single self-hosted server can be simpler than a hosted platform *and* more
yours than any of them — if it refuses to be general-purpose.

1. **Ecommerce-only is a feature.** Fixed, opinionated tables (products,
   variants, collections, orders, discounts) instead of a universal content
   model. The schema is the domain. This deletes the hardest 40% of what a
   generic CMS must build and lets every screen be exactly right for selling.
2. **Static by default, dynamic by necessity.** Product and collection pages
   change when a merchant edits — so they're baked to disk at publish and
   swapped atomically. Stock, cart, and checkout genuinely change per request —
   so they're server-rendered HTMX fragments. The classification is hardcoded
   per module; merchants never think about caching.
3. **Boring technology, deliberately.** Ruby, SQLite, HTMX, Stripe. One
   process, one database file, one uploads folder. Backup = copy two things.
   No Node in production, no framework runtime on the storefront, no
   JavaScript at all on a fully static page.
4. **The editor is a real canvas.** Vendored from Instatic (MIT, with
   attribution): multi-breakpoint frames, design tokens, reusable components,
   loops over collections. Merchants design their store the way designers work,
   and the output stays clean because the publisher — pure Ruby render
   functions — is the only thing that writes storefront HTML.
5. **One click to a real store.** The Instatic promise, applied to commerce:
   press a deploy button, wait ~two minutes, walk through a setup wizard, add a
   product, take a test payment. No terminal, no build pipeline, no third-party
   form/cart/analytics services to wire up.

## What the finished product looks like

A founder clicks Deploy on Railway (or runs one Docker image on any VPS).
Two minutes later they're in the setup wizard: store name, currency, admin
account, Stripe keys. They land in a store that already looks good — a starter
theme with home, collection, product, and cart pages built as editable canvas
documents, not locked templates.

They import products from CSV or add them by hand. They drag a collection loop
onto the homepage and it fills with their products. They hit Publish; every
page bakes to disk and flips live atomically. A customer hits the site: HTML
off disk in a millisecond, a skeleton cart badge that HTMX hydrates, a product
page whose stock pill is live while everything else is a static file. Checkout
is Stripe; the order lands in the merchant's own SQLite file; stock decrements;
nothing re-bakes.

The whole store — design, content, orders, customers — is one database file
and one folder, on a server the merchant controls, exportable as plain HTML
that would survive the company behind Dukafy disappearing.

## Product principles

- **Merchant time is sacred.** Every flow measured from intent to done.
  If it needs a terminal, it isn't shipped.
- **The storefront is the customer's, not ours.** No runtime, no tracking, no
  branding in the output. View-source should read like it was handwritten.
- **Purity in the publisher.** Render functions take data, return strings.
  Enforced by tests, because that purity is what makes baking, caching, and
  golden-testing possible.
- **Money is exact.** Integer cents everywhere. Stock is checked at the write,
  inside the one writer SQLite gives us.
- **Two implementations, one truth.** Every module is a React canvas component
  and a Ruby publish renderer. Golden tests and screenshot diffs keep them
  honest. The document JSON schema — exported from the editor's own types — is
  the single contract.
- **Extend later, and safely.** Dynamic tables and a sandboxed plugin system
  come after 1.0, on top of the fixed core — never instead of it.

## What Dukafy is not

- Not a general CMS, blog platform, or site builder. (Instatic exists.)
- Not multi-tenant SaaS in v1. One deploy = one store.
- Not a marketplace, subscription-billing, or ERP system.
- Not trying to beat Shopify on feature count — only on ownership, speed,
  and total cost for the small, taste-driven store.

## How we measure it

- **Deploy-to-first-sale:** under 5 minutes with test cards, zero terminal.
- **Storefront speed:** baked pages served in ~1ms; zero publisher JS on fully
  static pages; a hydrating fragment runtime measured in single-digit kB (HTMX).
- **Publish speed:** editing 1 product in a 500-product store re-bakes only its
  dependents, in well under a second.
- **Ownership test:** the exported `published/` folder is a working static
  storefront (minus cart) on any dumb file host.
- **Bus-factor test:** backup = database file + uploads folder; restore drill
  documented and rehearsed.

## Stack (fixed for v1)

Ruby 3.4 · Roda · Sequel · SQLite (WAL, single writer) · Phlex ·
HTMX 2 · Stripe Checkout · Puma (single worker, threaded) · Litestream ·
Docker one-image deploy · Editor: vendored Instatic (React 19 + Vite,
build-time only). Attribution: Instatic © David Babinec, MIT.
