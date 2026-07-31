# Store administration surface

Dukafy uses a dedicated **Commerce workspace inside the Instatic admin shell**
at `/admin/commerce`. Products, variants, collections, imports, and eventually
orders and discounts are managed beside Site and Media rather than through a
separate Ruby-rendered admin application.

Ruby exposes authenticated JSON endpoints under `/admin/api/cms/commerce`; it
does not expose a merchant-facing `/admin/store` application. The public host
is reserved for the storefront, static assets, and the API consumed by the CMS.
HTMX remains the storefront interaction layer for cart, stock, and checkout.
