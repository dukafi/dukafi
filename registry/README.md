# Dukafi plugin registry

A catalogue, not a host.

An author signs up, serves a **manifest** at a URL they control, and submits
that URL. The registry fetches it, validates it, and — once approved — lists it
so stores can browse. Files never pass through this service, and neither does
any money: a paid plugin is bought from its vendor and downloaded against a
licence key the vendor issues.

That is deliberate. It keeps the registry cheap to run, keeps us out of the
middle of somebody else's customer relationship, and means shipping a new
version is something an author does on their own server without telling us.

    go build ./...
    ./registry -addr :8080 -db registry.sqlite3 -admin-email you@yourdomain.com

| Flag | Env | Default |
|---|---|---|
| `-addr` | `REGISTRY_ADDR` | `:8080` |
| `-db` | `REGISTRY_DB` | `registry.sqlite3` |
| `-admin-email` | `REGISTRY_ADMIN_EMAIL` | *(unset — nobody can approve)* |
| `-admin-token` | `REGISTRY_ADMIN_TOKEN` | *(unset)* |
| `-allowed-origins` | `REGISTRY_ALLOWED_ORIGINS` | `https://dukafi.dev` |
| `-refresh-every` | `REGISTRY_REFRESH_EVERY` | `6h` |
| `-submissions-per-hour` | `REGISTRY_SUBMISSIONS_PER_HOUR` | `10` |
| `-requests-per-minute` | `REGISTRY_REQUESTS_PER_MINUTE` | `120` |
| `-burst` | `REGISTRY_BURST` | `40` |
| `-rate-limit-keys` | `REGISTRY_RATE_LIMIT_KEYS` | `50000` |
| `-trust-proxy` | `REGISTRY_TRUST_PROXY=1` | off |
| `-insecure` | `REGISTRY_INSECURE=1` | off |
| `-health-check` | — | off |

`-insecure` allows `http://` and private addresses. It is for pointing the
registry at a manifest on your own machine, and it turns off the SSRF guard —
never set it on anything reachable from the internet.

## Who can approve

`REGISTRY_ADMIN_EMAIL` names **one** address. Whoever signs up with it can
approve, reject and unlist; every other account can only publish and manage its
own plugins. There is no admin flag in the database and no way to grant one
through the API — losing the database does not lose control of who reviews, and
there is no row to UPDATE your way into.

Set it, then sign up with that address like any other author. `/account/review`
appears for that account and nobody else.

`REGISTRY_ADMIN_TOKEN` reaches the same endpoints as a bearer token, without a
browser. It is for scripts, and for getting back in if the admin account's
password is lost — there is no password reset yet.

With **neither** set the admin endpoints return 403 for everyone. An unset
secret must not mean "everyone is an admin".

`REGISTRY_ALLOWED_ORIGINS` is the browser origins allowed to *sign in* against
this registry — normally just `https://dukafi.dev`. The public catalogue stays
readable from anywhere (a self-hosted store's admin fetches it from whatever
domain the merchant uses); only the authenticated endpoints are origin-locked,
because those are the ones that carry a session.

`-health-check` does not start a server. It GETs `/healthz` on whatever
`-addr` names and exits 0 or 1 — the container healthcheck, since `scratch`
has no shell to run `curl` from.

## Rate limiting

Two layers, because the two things being defended are not the same thing.

**In memory, every request, keyed by source address.** A token bucket —
`-burst` available at once, refilling to `-requests-per-minute`. This defends
the process against a flood, so it never touches disk and is allowed to forget
everything on restart. `/healthz` is exempt: a 429 there would have an
orchestrator kill a container that is working fine.

The defaults are generous on purpose. A human browsing the catalogue with a
debounced search box legitimately fires several requests a second while typing,
and a store's plugin browser opens with a handful at once. This is here to stop
a flood, not to meter ordinary use.

**In SQLite, per hour, for the expensive and the sensitive.** Publishing,
refreshing, signing up, and *failed* logins. These have to survive a restart or
a restart is the bypass — and a crash is something an attacker can cause.

A **successful** login costs nothing. Counting it would lock an office behind
one NAT address out of their own accounts by lunchtime, while doing nothing
extra against a password guesser, who fails by definition. A failed login is
counted per address rather than per email, because per-email throttling lets
anyone lock a known account out of its own login on purpose.

A publish counts whether or not it succeeds: the fetch has already happened by
then, so "make it fail" must not be an unlimited fetch budget.

### -trust-proxy

`X-Forwarded-For` is believed **only** when this flag is set.

The header is client-supplied. With nothing in front of this service, anyone
can send `X-Forwarded-For: 1.2.3.4`, get a brand-new bucket for every request,
and walk straight through every limit above — which is exactly what happened
until a test was written for it.

The safe default has a real cost, and it is worth knowing before you deploy:
**behind a proxy with this unset, every visitor counts against the proxy's
single address and the whole service shares one budget.** That fails closed
rather than open, and the boot log says which mode is on. On Railway, Fly, or
anything behind a load balancer or Cloudflare, set it.

Rejections answer `429` with `Retry-After` and `RateLimit-Limit` /
`RateLimit-Remaining` / `RateLimit-Reset`, and they carry CORS headers — a 429
without them reaches a browser as an opaque CORS failure, and the UI can never
say why it stopped working.

## Running it

    docker run -d --name dukafi-registry \
      -p 8080:8080 \
      -v registry-data:/data \
      -e REGISTRY_ADMIN_EMAIL="you@yourdomain.com" \
      -e REGISTRY_ALLOWED_ORIGINS="https://dukafi.dev" \
      -e REGISTRY_TRUST_PROXY=1 \
      -e REGISTRY_ADMIN_TOKEN="$(openssl rand -hex 32)" \
      ghcr.io/dukafi/registry:latest

The image is `FROM scratch`: a static Go binary, a CA bundle, and nothing
else. No shell, no package manager, no libc — a service that fetches URLs
strangers choose should contain as little as possible. It runs as uid 65532.

`/data` holds the catalogue database and is the only state the service has.
The image ships an empty `/data` owned by 65532 so a **named or anonymous
volume inherits that ownership** and the first boot can create the file. A
**bind mount** takes the host directory's ownership instead, so that one needs
doing by hand:

    mkdir -p ./registry-data && sudo chown 65532:65532 ./registry-data

Publishing a new image:

    sudo ./deploy-registry --dry-run       # build + smoke test, push nothing
    sudo ./deploy-registry --tag 1.0.0     # pushes :1.0.0 and moves :latest

It runs `go test ./...` first, then boots the built image and checks three
things before anything can be pulled: `/healthz` answers, `GET /v1/plugins`
returns a catalogue (which proves the schema applied, which proves uid 65532
could create the database on a fresh volume), and the image's own healthcheck
probe passes. Add `--platform linux/amd64,linux/arm64` for a multi-arch
manifest — the binary is pure Go, so arm64 costs only build time.

## The manifest

What an author serves. Everything the catalogue shows comes from here, so
changing it is how a listing is updated.

```json
{
  "id": "acme-shipping",
  "name": "Acme Shipping",
  "description": "Live rates from Acme at checkout.",
  "version": "1.2.0",
  "author": "Acme Ltd",
  "homepage": "https://acme.example/dukafi",
  "category": "shipping",
  "license": "MIT",
  "images": ["https://cdn.acme.example/shot-1.png"],
  "minDukafiVersion": "0.2.0",
  "pricing": { "model": "free" },
  "distribution": {
    "type": "public",
    "downloadUrl": "https://cdn.acme.example/acme-shipping-1.2.0.tar.gz",
    "sha256": "…64 hex characters…"
  }
}
```

`id` is what a store installs by and cannot be changed later — a manifest whose
id changes is pointing at a different plugin, and a refresh that sees one is
refused rather than silently swapping what every store has installed.

`category` is one of: `payments`, `shipping`, `marketing`, `analytics`,
`content`, `media`, `integrations`, `other`. A fixed list, because a browsable
catalogue where everyone invents their own category is not browsable.

`sha256` is **required** for a public download. Without it a store installing
the archive trusts the host completely and cannot tell the vendor's file from
one substituted after the fact.

Omitting `pricing` means free. Omitting `distribution.type` with a
`downloadUrl` present means public. Most manifests are that simple.

## Paid and private plugins

The Elementor Pro shape: listed so people can find it, downloadable only with a
licence key.

```json
{
  "id": "acme-pro",
  "pricing": { "model": "paid", "price": "$49/year", "purchaseUrl": "https://acme.example/buy" },
  "distribution": {
    "type": "licensed",
    "licenseUrl": "https://acme.example/api/download",
    "checkUrl": "https://acme.example/api/check"
  }
}
```

A listing marked `licensed` carries **no download URL**. The store POSTs the
customer's key to the vendor's own endpoint and gets back a short-lived
download:

    POST https://acme.example/api/download
    { "licenseKey": "…", "pluginId": "acme-pro", "siteUrl": "https://shop.example" }

    → { "downloadUrl": "https://…?token=…", "sha256": "…", "expiresAt": "…" }

The checksum comes back **with the download** rather than sitting in the public
manifest, because a licensed archive may be minted per customer.

`checkUrl` is optional and lets a store confirm a key is still valid before
attempting an update, so an expired licence is reported as an expired licence
rather than a failed download.

The registry holds no keys, proxies no files, and cannot see who bought what.
Entitlement, refunds, seat limits and expiry are entirely the vendor's — which
is the only arrangement that scales past plugins we wrote ourselves.

A **private** plugin — one a vendor restricts to their own users rather than
selling — is the same mechanism with `pricing.model: "free"` and no
`purchaseUrl`.

## API

### Public — what a store browses

| | |
|---|---|
| `GET /v1/plugins` | approved listings. `?category=`, `?q=`, `?licensed=true\|false`, `?limit=`, `?offset=` |
| `GET /v1/plugins/{id}` | one listing |
| `GET /v1/plugins/{id}/versions` | every version the registry has seen |
| `GET /v1/categories` | categories with counts |
| `GET /healthz` | |

Only approved plugins are visible. A pending or rejected one is a 404, not a
403 — whether an id exists is not something to leak by status code. The
manifest URL is never returned publicly: where a vendor hosts is their
business, not a directory to browse.

### Accounts

    POST /v1/auth/signup   { "email": "…", "password": "…" }
    POST /v1/auth/login    { "email": "…", "password": "…" }
    POST /v1/auth/logout
    GET  /v1/auth/me       → { "account": { "email": "…", "admin": false } }

Signup and login set an **HttpOnly** session cookie and also return the session
value in the body. The cookie is what the browse UI on dukafi.dev uses — same
registrable domain, so it is same-site and rides along, while staying
unreadable to any script. The body value is for scripts and CI, which have no
cookie jar; send it as `Authorization: Bearer <session>`.

The cookie is `SameSite=Lax`, which is the CSRF defence: a POST from an
unrelated origin does not carry it. That is also why the frontend has to live
under the same registrable domain as the registry.

Passwords are bcrypt. There is no password reset yet — `REGISTRY_ADMIN_TOKEN`
is the way back in for the admin account.

### Publishing — signed in

| | |
|---|---|
| `POST /v1/me/plugins` | `{ "manifestUrl": "…", "note": "…" }` → 202 with the listing |
| `GET /v1/me/plugins` | your own listings, with status, reject reason and refresh errors |
| `POST /v1/me/plugins/{id}/refresh` | re-read your manifest now |
| `DELETE /v1/me/plugins/{id}` | withdraw — only while it has never been approved |

Everything you publish belongs to your account. Another account's plugin is a
**404** on these routes, not a 403: whether an id exists is not something to
confirm to someone who does not own it.

Publishing the **same** URL again re-reads it in place. Publishing a
**different** URL for a plugin you own moves it and sends it back to `pending`
— approval said "this plugin, served from here", and a new host is a claim
nobody has checked. A different **account** claiming a listed id is a 409.

An approved plugin cannot be withdrawn by its author. It would break every
store that installed it; ask for it to be unlisted instead.

Publishing is rate limited per account, signups and failed logins per address,
and every request against the in-memory limiter. A failed fetch counts —
otherwise supplying broken URLs is an unlimited budget for making this service
fetch things. See [Rate limiting](#rate-limiting).

### Admin

Either a session belonging to `REGISTRY_ADMIN_EMAIL`, or
`Authorization: Bearer <REGISTRY_ADMIN_TOKEN>`.

| | |
|---|---|
| `GET /v1/admin/plugins?status=pending` | the queue, with `publishedBy` — the account that pressed publish, which is not necessarily what the manifest's `author` field claims |
| `POST /v1/admin/plugins/{id}/approve` | list it |
| `POST /v1/admin/plugins/{id}/reject` | `{ "reason": "…" }`, shown to the author |
| `POST /v1/admin/plugins/{id}/unlist` | remove an approved listing |
| `POST /v1/admin/plugins/{id}/refresh` | re-read the manifest now |

A signed-in account that is not the admin gets **403**, not 401 — it is
authenticated, and re-authenticating will not help.

## Updates

Every live manifest is re-read on a schedule (`-refresh-every`). An author
ships 1.3.0 to their own host and the catalogue catches up on its own — **no
re-approval**, because re-approving every point release would make the registry
useless to both sides.

Approval is a judgement about a plugin and its author, not about one archive.
Two things are refused on refresh: a manifest that changes its `id`, and — by
never touching status — a rejected plugin trying to sneak back by editing its
own JSON.

A refresh that fails is **recorded, not fatal**. A vendor's host being down for
an hour must not delist them; the stored copy keeps serving and the error shows
up in the admin listing and to the submitter.

## Fetching URLs strangers chose

This service makes HTTP requests to addresses submitted by the public, from
inside whatever network it runs in. That is the dangerous thing it does, and
`fetch.go` exists because of it:

- `https` only;
- **every** address a hostname resolves to is checked, so a name answering with
  one public and one private address does not pass on the strength of the
  public one;
- redirects are re-checked — a public URL that redirects to `127.0.0.1` is the
  oldest way round an allow-list — and the dialler re-checks again, which also
  closes DNS rebinding;
- loopback, private, link-local, multicast, carrier-grade NAT and the TEST-NET
  ranges are all refused, including `169.254.169.254`, the cloud metadata
  service that hands out credentials to anything that can reach it;
- bodies are capped at 256 KB and every stage is deadlined;
- an upstream error never comes back in the response body, because that is how
  an SSRF probe reads its answer.

URLs *inside* a manifest — images, downloads, purchase pages — are checked for
scheme and literal private addresses but **not resolved**. The registry does
not fetch them, so resolving would mean a dozen DNS lookups per submission,
would fail good manifests whenever a resolver was slow, and would prove nothing
about what DNS says next week when a store actually downloads.

## Tests

    go test ./...

The suite is mostly about the ways this could fail quietly: a pending plugin
reachable by id, a bare token authenticating without the `Bearer` scheme (it
did, until a test said so), a second account claiming a listed id, an ordinary
account approving its own plugin, a stranger reaching another account's
listing, a failed refresh delisting a good plugin, a licensed plugin exposing a
direct download, a session appearing in a response it should not, `*` being
handed out alongside `Allow-Credentials`, and a rotated `X-Forwarded-For`
walking through every rate limit.
