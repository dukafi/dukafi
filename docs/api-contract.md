# Dukafi editor API contract

The vendored editor uses `/admin/api/cms` as its API root. Shapes were checked
against `dukafi-editor/src/core/persistence/` and `reference/instatic/server/handlers/cms/`.

## Authentication and bootstrap

| Method | Path | Request | Successful response |
| --- | --- | --- | --- |
| GET | `/setup/status` | — | `{hasSite, hasAdmin, hasOwner, needsSetup}` |
| GET | `/public-site` | — | `{name, faviconUrl}` |
| POST | `/setup` | `{siteName, email, password, displayName?}` | `201 {ok:true}` |
| POST | `/login` | `{email, password}` | `{ok:true, mfaRequired:false}` plus session cookie |
| POST | `/logout` | — | `{ok:true}` |
| GET | `/me` | — | `{user, role, capabilities}` |
| GET | `/me/preferences/:key` | — | `{value}` |
| PUT | `/me/preferences/:key` | `{value}` | `{value}` |
| DELETE | `/me/preferences/:key` | — | `{value:null}` |

Compatibility aliases also exist at `/admin/api/auth/login` and
`/admin/api/auth/me`. MFA, device/session management, and account-security
mutations are not exposed in the M1 UI.

## Site and pages

| Method | Path | Request | Successful response |
| --- | --- | --- | --- |
| GET | `/site` | — | `{site: SiteShell, seq}` |
| GET | `/pages` | — | `{rows: DataRow[]}` |
| GET | `/components` | — | `{rows: []}` |
| GET | `/layouts` | — | `{rows: []}` |
| PUT | `/site-document` | `{mode, site, changedPages, deletedPageIds, ...}` | `{ok:true, seq}` |
| POST | `/pages` | Page document | `201 {row}` |
| PATCH | `/pages/:id` | `{title?, slug?}` | `{row}` |
| DELETE | `/pages/:id` | — | `204` |
| GET | `/publish/status` | — | draft/live state and timestamps |
| POST | `/publish` | — | `{publishedPages}` |
| POST | `/tailwind/compile` | `{classes: string[]}` | `{css}` |

The editor loads the four document GET endpoints in parallel. Pages are translated
between Dukafi's `pages.document` JSON and Instatic's page `DataRow` wire
shape. `PUT /site-document` is atomic and is the primary canvas save path.

Page slugs must match lowercase alphanumeric/hyphenated segments with optional
single slashes. The server validates this contract as well as the page JSON
schema. Built-in Product and Collection templates are created lazily by the
pages/publish flows and use valid slugs without leading underscores.

## Media

| Method | Path | Request | Successful response |
| --- | --- | --- | --- |
| GET | `/media` | optional `?trash=1` | `{assets: MediaAsset[]}` |
| POST | `/media` | multipart field `file` | `201 {asset}` |
| DELETE | `/media/:id` | — | `204` |
| GET | `/media/folders` | — | `{folders: []}` |

Folder mutation, soft-delete/restore, binary replacement, and storage-adapter
screens are deferred and their entry points are not part of the M1 navigation.
Raster upload responses include width, height, and generated WebP variant
metadata. Processing failures return 503 when libvips is unavailable or 422 for
an invalid image. Deletion removes both the original and managed variants.

## Commerce workspace

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/commerce/products` | List or create products |
| GET/PATCH/DELETE | `/commerce/products/:id` | Read, update, or delete a product |
| POST | `/commerce/products/:id/variants` | Create a variant |
| PATCH/DELETE | `/commerce/products/:id/variants/:variant_id` | Update or delete a variant |
| GET/POST | `/commerce/collections` | List or create collections |
| PATCH/DELETE | `/commerce/collections/:id` | Update or delete a collection |
| PUT | `/commerce/collections/:id/products` | Replace ordered product membership |
| POST | `/commerce/import` | Import a product/variant CSV |

These endpoints require the authenticated CMS session. Storefront routes never
serve commerce administration HTML.

Product create/update and variant mutations may include or trigger a dependency-
aware partial rebake. Product reads accept either a numeric id or an active
product slug; writes use numeric ids.

## Public storefront fragments

These routes are outside the CMS API and use the anonymous cart session:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/fragments/stock` | Live aggregate or selected-variant stock badge |
| GET | `/fragments/cart/badge` | Live cart count link |
| POST | `/fragments/cart/items` | Add a positive quantity of an active product variant |

The add endpoint returns HTML, checks requested quantity against current stock,
and emits `HX-Trigger: dukafi:cart-updated` on success. Cart drawer, remove, and
quantity-update endpoints are not implemented yet. `/checkout` currently
returns 501.

## Errors

Every Ruby API failure uses:

```json
{"error":{"code":"machine_readable_code","message":"Human-readable message"}}
```

Authentication failures return 401, missing resources 404, conflicts 409, and
invalid payloads 422. API clients should use the envelope rather than parsing
Ruby exception text.
