# Dukafy editor API contract

The vendored editor uses `/admin/api/cms` as its API root. Shapes were checked
against `instatic/src/core/persistence/` and `reference/instatic-server/handlers/cms/`.

## Authentication and bootstrap

| Method | Path | Request | Successful response |
| --- | --- | --- | --- |
| GET | `/setup/status` | — | `{hasSite, hasAdmin, hasOwner, needsSetup}` |
| GET | `/public-site` | — | `{name, faviconUrl}` |
| POST | `/setup` | `{siteName, email, password, displayName?}` | `201 {ok:true}` |
| POST | `/login` | `{email, password}` | `{ok:true, mfaRequired:false}` plus session cookie |
| POST | `/logout` | — | `{ok:true}` |
| GET | `/me` | — | `{user, role, capabilities}` |

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

The editor loads the four GET endpoints in parallel. Pages are translated
between Dukafy's `pages.document` JSON and Instatic's page `DataRow` wire
shape. `PUT /site-document` is atomic and is the primary canvas save path.

## Media

| Method | Path | Request | Successful response |
| --- | --- | --- | --- |
| GET | `/media` | optional `?trash=1` | `{assets: MediaAsset[]}` |
| POST | `/media` | multipart field `file` | `201 {asset}` |
| DELETE | `/media/:id` | — | `204` |
| GET | `/media/folders` | — | `{folders: []}` |

Folder mutation, soft-delete/restore, binary replacement, and storage-adapter
screens are deferred and their entry points are not part of the M1 navigation.

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

## Errors

Every Ruby API failure uses:

```json
{"error":{"code":"machine_readable_code","message":"Human-readable message"}}
```

Authentication failures return 401, missing resources 404, conflicts 409, and
invalid payloads 422.
