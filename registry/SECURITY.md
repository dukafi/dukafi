# Registry security

This service stores **public** plugin archives and serves them to stores.
Licensed plugins stay with their vendor. The registry does not run plugin
code. That is the whole split.

What follows is the threat model for hosting third-party files, and the
rate limits that keep ingest and download from becoming the outage.

## What we store

On publish and on refresh, a **public** listing's `downloadUrl` is fetched
with the same SSRF rules as the manifest. The bytes are checked:

- gzip magic (`1f 8b`) — not HTML, not a zip, not an empty 200;
- SHA-256 matches `distribution.sha256` — the listing and the file agree;
- at most 5 MB — the same cap a store will accept, so we never list an
  archive no merchant can install.

They land in a Railway Storage Bucket as `plugins/{id}/{sha256}.tar.gz`
(or next to the SQLite file when no bucket is configured). The public
listing then points `downloadUrl` at `GET /v1/plugins/{id}/download` on
**this** host. Stores still hash what they receive and refuse a mismatch.

A **licensed** listing is not fetched, not stored, not served. The vendor
hands a download to whoever presents a key. We never see the file or the
key.

Pending listings may already have a blob (ingest happens at publish,
before a human approves). The download endpoint still 404s until the
listing is approved. Unreviewed code is not a public download.

The registry **does not unpack** the gzip and **does not load** `plugin.rb`.
A blob is opaque. Extraction, path-traversal checks, and execution happen
on the store that chose to install it.

## What we fetch

Publish still starts with a URL the author chose. That remains the
dangerous thing this process does. `fetch.go` is the guard:

- `https` only (`-insecure` is development-only and turns the guard off);
- every address a hostname resolves to is checked, not just the first;
- redirects are re-checked, then the dialler checks again (DNS rebinding);
- loopback, private, link-local, multicast, CGNAT, TEST-NET, and
  `169.254.169.254` are refused;
- bodies are capped (256 KB for a manifest, 5 MB for an archive);
- an upstream error never comes back in the response body.

URLs *inside* a manifest that we do not fetch (images, purchase pages,
licensed `licenseUrl`) are still checked for scheme and literal private
addresses, but not resolved. Resolving them would prove nothing about
DNS next week and would fail good listings whenever a vendor's resolver
was slow.

## Rate limits

Two layers, because the two things being defended are not the same thing.

**In memory, every request, keyed by source address.** A token bucket
(`-requests-per-minute`, `-burst`). Defends the process against a flood.
Forgets everything on restart. `/healthz` is exempt — a 429 there would
have an orchestrator kill a healthy container. Preflight OPTIONS is
exempt so a CORS request does not cost two tokens.

Defaults are generous on purpose. A human typing into a debounced search
box, or a store opening the plugin browser, is ordinary use. This layer
stops a flood, not ordinary browsing.

**In SQLite, per hour, for the expensive and the sensitive.** These have
to survive a restart, or a restart is the bypass — and a crash is
something an attacker can cause.

| Key | Default | Why |
|---|---|---|
| `publish:{account}` | 10/hour | Each publish fetches a URL of the author's choosing, then copies up to 5 MB. A failure still counts: "make it fail" must not be an unlimited fetch budget. |
| `refresh:{account}` | 10/hour | Same fetch, on demand. |
| `signup:{ip}` | 10/hour | Bulk accounts are how you get around a per-account publish cap. |
| failed `login:{ip}` | 10/hour | Per address, not per email — per-email throttling lets anyone lock a known account out of its own login. A *successful* login costs nothing. |
| `download:{ip}` | 60/hour | Serving a stored archive is cheaper than ingesting one, but 5 MB × unbounded GET still empties bandwidth. A store installing a handful of plugins is well under this. |

`-trust-proxy` is required behind a load balancer. Without it, every
visitor shares the proxy's one address (fail closed). With it and
nothing in front, anyone can send `X-Forwarded-For: 1.2.3.4` and walk
through every limit. The boot log says which mode is on.

Rejections are `429` with `Retry-After` and `RateLimit-*`, and they
carry CORS headers — a 429 without them reaches a browser as an opaque
CORS failure.

## What approval is for

Checksums prove the file matches the listing. They do not prove the
file is safe. A public plugin that passes ingest is still someone
else's Ruby, and it runs **inside the store** after a merchant presses
Install.

Approval is a judgement about a plugin and its author, not about one
archive. A new version is copied on refresh without re-approval, which
is the only way the catalogue stays useful. A manifest that changes
its `id` is refused rather than silently swapping what every store has
installed.

Do not treat this registry as an antivirus. If a plugin should not run
on other people's stores, do not approve it.

## Operational notes

- The SQLite catalogue lives on the service volume. Public archives live
  in the Railway bucket (`BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`,
  `ENDPOINT`, `REGION`). Back up both.
- `REGISTRY_PUBLIC_URL` is the origin written into listings. A typo
  here makes every store fetch the wrong host.
- `-insecure` allows `http://` and private addresses. Never on anything
  reachable from the internet.
- The image is `FROM scratch`, uid 65532, no shell. A service that
  fetches URLs strangers choose should contain as little as possible.
