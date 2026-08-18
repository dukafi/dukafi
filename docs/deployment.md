# Deploying Dukafi

One image, either database: `ghcr.io/dukafi/dukafi`.

---

## Read this first: Dukafi is stateful

Publishing writes **files**. `Storefront#disk_page` serves `published/current/*.html`
straight off disk, and `/uploads` is served by `Rack::Files`. Choosing Postgres
moves the *database* off the container — it does not make the container
stateless.

That has two consequences, and neither is optional:

1. **Every deployment needs a persistent volume**, on both engines.
2. **Run one replica.** Two containers would each hold their own published
   output and their own uploads, and a visitor would get whichever one the load
   balancer picked. `railway.json` pins `numReplicas: 1` for this reason.

Object storage for media and published output is what would lift that limit.
It does not exist yet.

---

## What lives where

| Path | Holds | Lost on redeploy without a volume |
|---|---|---|
| `/data/dukafi.sqlite3` | everything, on SQLite | the entire store |
| `/data/published/` | the storefront that is actually served | the live site |
| `/data/uploads/` | product images, media, self-hosted fonts | every image |

All three are relocatable:

| Variable | Default in the image | Notes |
|---|---|---|
| `DUKAFI_DB` | `/data/dukafi.sqlite3` | ignored when `DATABASE_URL` is set |
| `DUKAFI_PUBLISHED_ROOT` | `/data/published` | |
| `DUKAFI_STORAGE_ROOT` | `/data` | the directory *containing* `uploads/` |

The pre-rename `DUKAFY_*` spellings still work, so an existing deploy keeps
running untouched. `DUKAFI_*` wins if both are set.

---

## Environment

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | **yes** | `openssl rand -hex 64`. The entrypoint refuses to start without it. |
| `DATABASE_URL` | no | Set → Postgres. Unset → SQLite. Both `postgres://` and `postgresql://` work. |
| `PORT` | no | Railway assigns this; the image binds to whatever it is handed. The edit sidecar (MCP writes) uses a Unix socket inside the container — it is not a second published port. |
| `DB_POOL` | no | Postgres connection pool, default 5. |
| `SKIP_MIGRATIONS` | no | `1` to skip. Only for a second instance that must not migrate. |

Migrations run on every boot and are idempotent, so **a redeploy is the whole
upgrade procedure**.

---

## Railway

1. **New Project → Deploy from GitHub repo** → `dukafi/core`.
   Railway reads `railway.json` and builds the `Dockerfile`.
2. **Add a Volume**, mount path `/data`. Do this *before* the first successful
   deploy — anything written beforehand is on ephemeral disk.
3. **Variables** → set `SESSION_SECRET`.
4. For Postgres: **New → Database → Postgres**, then on the Dukafi service add
   a reference variable `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
   Skip this entirely to stay on SQLite.
5. **Settings → Networking → Generate Domain.**

Health checks hit **`/admin/api/health`**, not `/health`. The route is mounted
inside `AdminApi`, and a bare `/health` falls through to the storefront as a
404 — there is deliberately no top-level one, because it would shadow a
merchant page with the slug `health`. It needs no authentication.

Hitting the app rather than the port proves the process booted, which proves
the database connected: `config/database.rb` connects at load, so a bad
`DATABASE_URL` never gets as far as listening.

### Publishing this as a Railway template

Railway builds templates from a deployed project: open the project →
**Settings → Share as Template**. Set `SESSION_SECRET` as a generated secret so
each deployer gets their own, keep the `/data` volume in the template, and mark
Postgres optional. There is no file in this repo that defines a template;
Railway stores it against your account.

---

## Docker, anywhere else

SQLite:

```sh
docker volume create dukafi-data
docker run -d --name dukafi -p 9292:9292 \
  -e SESSION_SECRET="$(openssl rand -hex 64)" \
  -v dukafi-data:/data \
  ghcr.io/dukafi/dukafi:latest
```

Postgres — note the volume is still there:

```sh
docker run -d --name dukafi -p 9292:9292 \
  -e SESSION_SECRET="$(openssl rand -hex 64)" \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dukafi" \
  -v dukafi-data:/data \
  ghcr.io/dukafi/dukafi:latest
```

Locally, `docker-compose.yml` runs either shape:

```sh
docker compose up dukafi                        # SQLite
docker compose --profile postgres up dukafi-pg  # Postgres
```

---

## Backups

**SQLite** — one file, but copying it while the server runs can capture a torn
WAL. Use SQLite's own backup:

```sh
docker exec dukafi sqlite3 /data/dukafi.sqlite3 ".backup '/data/backup.sqlite3'"
```

**Postgres** — `pg_dump` as usual.

Either way the database is only part of it: `/data/uploads` holds media that
exists nowhere else. `/data/published` is regenerable by pressing Publish.

---

## Publishing the image

```sh
echo 'ghp_xxx' > .ghcr-token && chmod 600 .ghcr-token   # classic PAT, write:packages
sudo ./deploy-image --tag 1.0.0     # pushes :1.0.0 and moves :latest
sudo ./deploy-image --tag @latest   # :latest only
sudo ./deploy-image --dry-run       # build + smoke test, push nothing
```

The token lives in a gitignored file because `sudo` does not pass environment
variables through — an exported `GHCR_TOKEN` is invisible to the script.
`sudo -E ./deploy-image` works too.

Before pushing, the script **boots the image it just built and waits for the
health endpoint**. A registry tag is public and effectively permanent, so a broken
entrypoint or an unapplied migration should stop the release rather than ship.
`--skip-smoke` opts out.

It also refuses to publish a version tag from a dirty tree, and moves `:latest`
only for a plain version — `1.1.0-rc1` and git-describe strings do not.

GHCR packages start **private**. Make it public at
`https://github.com/orgs/dukafi/packages` or nobody can pull it.

---

## Building the image

amd64 only. The publish path shells out to the Tailwind standalone binary at
**runtime**, and `scripts/install_tailwind.rb` pins the linux-x64 checksum;
arm64 needs a second pinned checksum, not just a buildx flag.
