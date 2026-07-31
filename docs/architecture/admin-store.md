# Store administration surface

Dukafy uses a dedicated server-rendered `/admin/store` area for commerce data.
The visual editor remains a vendored React application under `/admin/site` and
is responsible only for page composition. Products, variants, collections,
orders, and discounts use Ruby-rendered HTML enhanced with HTMX.

This keeps catalog operations available without adding commerce screens to the
vendored editor or introducing a second frontend build. All routes share the
same authenticated admin session.
