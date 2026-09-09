# Deploy and Host Dukafi sqlite on Railway

Dukafi is a self-hosted commerce CMS: visual page editor, catalogue, checkout, and a published static storefront. This SQLite template runs the whole store as one Railway service. Database, uploads, plugins, and baked HTML live on one volume — no Postgres. Open the URL, create the owner account, and the shop is live.

## About Hosting Dukafi sqlite

The image starts Puma, runs migrations, and serves admin plus the storefront from one process. SQLite is the default when `DATABASE_URL` is unset; the file is `/data/dukafi.sqlite3`. Attach a persistent volume at `/data` before the first deploy, or a restart wipes the store, media, and published HTML. Set `SESSION_SECRET` (64+ random characters). Railway injects `PORT`; leave it unset. Health checks must hit `/admin/api/health`, not `/health`. Stay on one replica: SQLite and on-disk published files do not share cleanly across instances. After deploy, open the public domain and complete owner setup.

## Common Use Cases

- Launch a single-merchant store without operating Postgres: one service, one volume, one public URL.
- Demo or staging shops that should boot in minutes and restore from a volume backup.
- A production shop that will later add Railway Postgres by setting `DATABASE_URL`, while keeping `/data` for uploads and published files.

## Dependencies for Dukafi sqlite Hosting

- Persistent volume mounted at `/data` (required; holds SQLite, uploads, plugins, published storefront)
- `SESSION_SECRET` — generate with Railway `${{secret(64)}}` or `openssl rand -hex 64`

### Implementation Details

Keep `DATABASE_URL` unset. The image then uses SQLite.

| Setting | Value |
| --- | --- |
| Volume mount | `/data` |
| SQLite file | `/data/dukafi.sqlite3` (`DUKAFI_DB`) |
| Uploads | `/data/uploads` |
| Published HTML | `/data/published` |
| Plugins | `/data/plugins` |
| Healthcheck | `/admin/api/health` (start period ≥ 30s) |
| Replicas | `1` |
| Image | `ghcr.io/dukafi/dukafi:latest` |

```
SESSION_SECRET=${{secret(64)}}
DUKAFI_PUBLIC_ORIGIN=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

Do not set `DATABASE_URL`. Do not add a second published port — the edit sidecar listens on a Unix socket inside the container. Railway injects `PORT`; do not set 9292.

Template variable descriptions (paste into the Railway variable fields):

- `SESSION_SECRET`: Signs admin, cart, and order cookies. Generate a unique 64-character secret for this deploy — the store will not start without it. Use Railway’s generator: `${{secret(64)}}`.
- `PORT`: HTTP port the app listens on. Leave this empty — Railway injects PORT at deploy. Do not set 9292 or any other custom value.

First boot: open the generated domain → owner setup → pick a starter theme → publish.

## Why Deploy Dukafi sqlite on Railway?

<!-- Recommended: Keep this section as shown below -->
Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying Dukafi sqlite on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
<!-- End recommended section -->
