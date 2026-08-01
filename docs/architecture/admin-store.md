# Store administration surface

Dukafy uses a dedicated **Commerce workspace inside the Instatic admin shell**
at `/admin/commerce`. Products, variants, collections, imports, and eventually
orders and discounts are managed beside Site and Media rather than through a
separate Ruby-rendered admin application.

Ruby exposes authenticated JSON endpoints under `/admin/api/cms/commerce`; it
does not expose a merchant-facing `/admin/store` application. The public host
is reserved for the storefront, static assets, and the API consumed by the CMS.
HTMX remains the storefront interaction layer for cart, stock, and checkout.

## Development navigation

Run `./bin/dev`, then use:

- `http://localhost:5173/admin/` for the Site/editor workspace
- `http://localhost:5173/admin/commerce` for Products, Collections, and Import
- `http://localhost:5173/admin/media` for managed uploads
- `http://localhost:9292/` only to inspect the customer storefront

Vite proxies `/admin/api/*` to Ruby. A 502 from port 5173 normally means the
Ruby process on port 9292 is not reachable; a JSON 404 means the editor and Ruby
API contract may be out of sync.

## Catalog versus layout

Commerce owns data: product title/slug/status/vendor/description, variant SKU,
price, currency, inventory, and collection membership. Site owns presentation:
ordinary pages and the shared Product/Collection templates.

This separation is intentional. Merchants do not design hundreds of copied
product documents. The publisher feeds each active catalog entry into the same
template as `currentEntry`, and blank commerce-module slug props follow that
entry. The result remains editable like a site builder without making catalog
data denormalized page content.

## Current scope

The Commerce workspace currently supports products, inline variants, ordered
collections, and CSV import. Orders, discounts, refunds, and fulfillment are
planned but must not be presented as available UI until M5 is completed.
