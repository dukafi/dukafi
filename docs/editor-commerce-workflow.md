# Editor and commerce workflow

This guide explains how catalog data becomes customer-facing pages. Dukafi
keeps administration in the authenticated editor and keeps the storefront
strictly public-facing.

## Surfaces and URLs

With `./bin/dev` running:

| Task | URL |
| --- | --- |
| Edit site/templates | `http://localhost:5173/admin/` |
| Manage products/collections | `http://localhost:5173/admin/commerce` |
| View storefront | `http://localhost:9292/` |
| View a product | `http://localhost:9292/products/<slug>` |
| View a collection | `http://localhost:9292/collections/<slug>` |

Port 5173 is the Vite development shell. Customer-facing output is served by
Ruby on port 9292.

## Create a sellable product

1. Open **Commerce → Products**.
2. Create a product with a lowercase hyphenated slug.
3. Set status to `active`.
4. Add at least one variant with a unique SKU, integer-cent price, currency,
   stock, and position.
5. Save the product.
6. Add it to one or more collections if it should appear in collection loops.

A product without an active status is retained as a draft catalog record but
is excluded from the prefetched public catalog and generated storefront pages.

## Design product pages dynamically

Open **Site**, select **Product template**, and arrange the commerce modules.
The initial generated template contains title, image gallery, price, variant
picker, stock badge, and buy button.

The template is one canvas document shared by all products. Dynamic bindings
resolve `currentEntry` while each product page is rendered. For example, the
heading’s text binds to `currentEntry.title`. Store modules with an empty
`productSlug` use the same current product. Supplying a slug pins a module to a
specific product instead, which is useful on ordinary promotional pages.

Publishing produces:

```text
products/canvas-bag.html  →  /products/canvas-bag
products/linen-shirt.html →  /products/linen-shirt
```

## Design collection pages dynamically

Open **Collection template**. Its default collection loop has an empty
`collectionSlug` and a binding to the current collection. Its child product
card is rendered once per ordered collection member.

The first collection page is baked. Pagination uses a node-specific query such
as `?loop_collection-products_page=2` and renders live because the query changes
the requested slice.

On a normal landing page, set a collection loop’s slug explicitly to feature a
chosen collection.

## Commerce modules

| Module | Published behavior |
| --- | --- |
| Product card | Baked title/image/price/link for a product |
| Price | Baked formatted variant-aware price |
| Image gallery | Baked responsive images and `srcset` |
| Variant picker | Baked selection UI from variant data |
| Buy button | Posts the selected SKU/quantity to the cart fragment |
| Collection loop | Baked ordered product iteration; query pages render live |
| Stock badge | HTMX live fragment, never trusted as baked inventory |
| Cart badge | HTMX live fragment tied to anonymous session cart |

The stock and cart badges use an `hx-trigger="revealed"` hydration pattern so
static pages can be cached without freezing personalized/live values.

## Save, publish, and inspect

Saving persists drafts. Publishing snapshots them, renders all public entries,
compiles CSS, and atomically activates a new release. After publishing, open the
port-9292 URL and inspect the response:

```bash
curl -I http://localhost:9292/products/canvas-bag
```

`X-Dukafy-Render: disk` confirms the static fast path. View-source should show
semantic HTML and a `/assets/site-<hash>.css` link rather than a React app.

## Catalog edits and partial rebakes

Product and variant mutations invoke dependency-aware partial baking. Dukafi
tracks which generated paths use each product. A product edit rerenders its own
page and affected authored/collection pages while copying the unaffected live
slot content and atomically activating the result. This avoids regenerating an
entire large store for a localized catalog change.

Inventory is a dynamic concern. Stock display comes from a fragment and does
not require all static pages to be rebuilt.

## Current cart boundary

The current cart supports anonymous session creation, add-to-cart with an
availability check, a live item-count badge, and stock status. Drawer rendering,
quantity update/removal, checkout, orders, discounts, and Stripe completion are
not implemented yet. Consult [../MILESTONES.md](../MILESTONES.md) before treating
the app as capable of production sales.
