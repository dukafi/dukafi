# M15 — Replicas & storage separation

Scope: make it possible to run more than one Dukafi container. Tier 1 (launch-blocking):
N replicas on one host via docker-compose sharing a named volume, with a migrator service
owning the volume and DB locks preventing double-publish and double-scheduling. Tier 2
(fast-follow): true multi-node replicas (Railway `numReplicas > 1`) by moving uploads
behind a media storage adapter and published output into a DB-backed store. Depends on
M14's `SchedulerLock`.

TL;DR: the app image is already stateless (everything merchant-owned lives under
`/data` via `dukafi/config/paths.rb`); what blocks replicas is *shared access* to that
state. Tier 1 shares the volume itself and serializes the writers. Tier 2 removes the
volume from the request path entirely.

---

## Current state (verified in-tree)

- All four state roots are env-relocatable through one module (`dukafi/config/paths.rb`):
  DB (`DUKAFI_DB` / `DATABASE_URL`), `DUKAFI_PUBLISHED_ROOT`, `DUKAFI_STORAGE_ROOT`
  (contains `uploads/`), `DUKAFI_PLUGINS_ROOT`. The image writes nothing outside `/data`.
- `docker/entrypoint.sh`: chowns a fresh volume, hard-fails without `SESSION_SECRET`,
  runs migrations unless `SKIP_MIGRATIONS=1` ("exists for the multi-instance case, where
  exactly one process should migrate"), starts the editor sidecar on a **unix socket**
  (per-container `/tmp`, replica-safe by construction).
- Publishing: two-slot symlink flip (`dukafi/services/publish_site.rb`, `bake.rb`) —
  atomic on one filesystem, but **two concurrent publishers would race the slots**.
- Sessions are signed cookies; carts/orders are DB rows — already replica-safe.
- `railway.json` pins `numReplicas: 1`; `docs/deployment.md` says "Run one replica…
  Object storage for media and published output is what would lift that limit. It does
  not exist yet."
- `docker-compose.yml` has `dukafi` (sqlite) + `dukafi-pg` (postgres profile), one
  replica each, host port binding.
- Reference: `../instatic-inspo` uses `pg_try_advisory_lock` leader election
  (`server/db/advisoryLock.ts`) and compose overlays (`compose.prod.yml` +
  `compose.sqlite.yml` + `compose.tls.yml`); Railway templates there set
  `RAILWAY_RUN_UID=0` for root-mounted volumes (our entrypoint already handles root
  chown, so we don't need that).

### On "an image that just holds the volume"

The idea is right; the mechanism has a modern form. Docker's old "data-only container"
pattern is deprecated — **named volumes** are its replacement and are already shareable
across any number of containers on one host. What the volume still needs is an *owner*
for one-time work (mkdir/chown, migrations, seeding). Tier 1 therefore adds a
**migrator service**: same image, runs the entrypoint's setup + migrations, exits 0;
app replicas wait on it and skip migrations. That is the "container that holds the
volume", implemented the supported way.

## Tier 1 — same-host replicas (launch-blocking)

### Rules

1. **Postgres required for >1 replica.** SQLite over a shared volume is multi-process
   capable in WAL mode but we will not support it: the compose scale overlay wires
   `DATABASE_URL` and the app **refuses to boot** with >0 configured replicas… (cannot
   detect replica count — instead:) the docs state it, and `SchedulerLock`/publish lock
   are DB-row based so they work regardless; sqlite scaling is simply undocumented and
   untested.
2. **One migrator.** Compose service `migrate`: same image,
   `command: ["ruby", "scripts/migrate.rb"]` via the entrypoint (which also chowns),
   `restart: "no"`. App service: `SKIP_MIGRATIONS=1`,
   `depends_on: {migrate: {condition: service_completed_successfully}, postgres: {condition: service_healthy}}`.
3. **Publish is single-flight.** Wrap `PublishSite` in `SchedulerLock`-style DB claim
   (`publish_lock` row or reuse the same table with `id=2`): second concurrent publish
   returns 409 "publish already in progress" to the admin UI (which shows it as a toast
   and refetches state). The symlink flip itself stays as-is — atomic on the shared
   volume.
4. **Scheduler leader** — already solved by M14's `SchedulerLock`; replicas that lose
   the claim idle.
5. **No host-port binding on the app.** Replicas can't share a host port; a proxy fronts
   them. Compose overlay adds Caddy (`compose.caddy.yml`, built in M16) with
   `reverse_proxy dukafi:9292` — Docker's embedded DNS round-robins the service name
   across replicas.
6. **Local caches stay local.** Tailwind binary, `/tmp`, sidecar socket — all
   per-container, already fine. Verify nothing writes under `APP_ROOT` at runtime:
   add an architecture spec asserting `Paths` is the only source of writable roots
   (grep-style spec like `spec/publisher/purity_spec.rb`).

### Deliverables

- `compose.scale.yml` overlay: postgres, migrate service, app with
  `deploy: {replicas: 2}`, no ports, `SKIP_MIGRATIONS=1`, shared `dukafi-data` volume;
  pairs with `compose.caddy.yml`.
- Publish lock + 409 path + spec (two threads race `PublishSite`, one wins, store never
  serves a half-flipped slot — assert `current` always resolves).
- Smoke script `scripts/smoke-replicas.sh`: compose up with scale=2, wait healthy,
  create page via API through the proxy, publish, curl the page 20×, upload media, curl
  it, publish again during a publish (expect 409), compose down. Wired into CI as a
  manual/nightly job (it needs compose; keep the default PR pipeline unchanged).
- `docs/deployment.md` gains a "Scaling out (one host)" section replacing the flat
  "run one replica" rule with: 1 replica = default; N replicas = Postgres + scale
  overlay.

## Tier 2 — multi-node replicas (fast-follow, not launch-blocking)

Two state roots must leave local disk. Everything else already lives in the DB.

### 2a. Media storage adapter

Seam in the payments/mail style, but core-owned with a plugin registration hook:

```ruby
# dukafi/services/media_storage.rb
#   store(io:, path:, content_type:)  -> StoredFile(url:, path:)
#   read_url(path)                    -> String   (public or signed URL)
#   delete(path)                      -> void
#   verify!                           -> raises with a human explanation
# Default adapter: LocalDisk (today's behavior, zero-config).
# Plugin registration: p.media_storage "s3", S3::Adapter, label: "S3-compatible"
```

- First-party plugin `plugins-available/s3_storage`: S3-compatible (AWS, R2, Railway
  bucket, MinIO) via hand-rolled SigV4 (no aws-sdk gem — mirror `registry/s3blobs.go`'s
  scope: PUT/GET/DELETE + presign). Settings: bucket, endpoint, region, access key,
  secret, `public_base_url` (optional CDN).
- `media_assets` migration: add `storage` (`local|<adapter slug>`) — existing rows
  `local`. `MediaAsset#url` resolves through the adapter; templates/publisher already
  use the stored public path, so the publisher change is confined to URL resolution.
- **Migration command** `scripts/migrate_media.rb --to s3`: copies every local asset
  up, verifies, flips the row, optionally deletes local. Idempotent, resumable.
- Uploads route keeps accepting through the app (adapter streams through), so plugin
  and MCP upload paths are unchanged.
- WebP variant generation (libvips) keeps running in-app on upload; variants are stored
  through the same adapter.

### 2b. Published store

```ruby
# dukafi/services/published_store.rb — backend chosen by DUKAFI_PUBLISHED_STORE=disk|db
#   write_version(version, files)  files = {path => {content:, content_type:}}
#   activate(version)              -- disk: symlink flip; db: transaction on published_state
#   read(path)                     -- disk: File; db: row + per-process LRU keyed (path, version)
#   current_version
```

- `db` backend tables: `published_files(version, path, content, content_type, pk(version, path))`
  + `published_state(id=1, current_version)`. Activate = one UPDATE in a transaction —
  atomic across all replicas by definition. Keep the two most recent versions, purge
  older in the same transaction.
- `Storefront#disk_page` becomes `PublishedStore.read`; the LRU (size ~200 entries,
  version-checked on every hit) keeps hot pages out of the DB. Hashed CSS assets and
  sitemaps go through the same store.
- Rationale over publish-to-S3 (D11): no second infra dependency, transactional flip,
  and page HTML is small; S3-backed published output can become a third backend later
  without touching callers.

### 2c. Unlock Railway replicas

Once 2a+2b are configured: `railway.json` documentation for `numReplicas` (leave the
committed default at 1; the deployment doc explains the three settings that must be on —
`DATABASE_URL`, s3_storage configured, `DUKAFI_PUBLISHED_STORE=db`). Add a boot-time
warning when `numReplicas`-style env (`RAILWAY_REPLICA_ID` present and != 0) is detected
with local storage still active.

## Tasks

Tier 1 (launch): 
1. Publish single-flight lock + 409 + spec.
2. Writable-roots architecture spec.
3. `compose.scale.yml` + migrator service pattern (compose file itself lands in M16's
   overlay set; the entrypoint/compose semantics land here).
4. `scripts/smoke-replicas.sh` + nightly CI job.
5. `docs/deployment.md` scaling section.

Tier 2 (fast-follow):
6. `MediaStorage` seam + LocalDisk default + `p.media_storage` registration + specs.
7. `plugins-available/s3_storage` (SigV4) + spec against MinIO in CI (service container).
8. `media_assets.storage` migration + URL resolution + `migrate_media.rb`.
9. `PublishedStore` with disk + db backends + LRU + specs (flip atomicity: reader thread
   during activate never sees a mixed version).
10. Storefront/publisher/asset/sitemap call-site conversion + golden specs unchanged.
11. Railway replica docs + boot warning.

## Out of scope

CDN integration, Litestream/SQLite replication guides (parking lot), horizontal editor
collab (the editor is per-admin already), read replicas of Postgres, autoscaling.

## Related

- `docs/LAUNCH-PLAN.md` D10–D11
- M14 `SchedulerLock` — reused here
- M16 packages the compose overlays and rewrites the deployment docs
- `../instatic-inspo/compose.*.yml`, `server/db/advisoryLock.ts`,
  `docs/features/media.md` (storage adapter contract prior art)
