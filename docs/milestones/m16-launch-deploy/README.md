# M16 — Launch & deploy: Railway template, compose overlays, docs, release

Scope: everything between "the features exist" and "a stranger deploys a store in ten
minutes". Railway one-click template, the compose overlay set, `.env.example`, first-run
experience, README/docs rewrite, release mechanics. Depends on M13 (starter theme for
first-run) and M15 Tier 1 (scale overlay). Launch-blocking; this milestone ends with the
1.0 tag.

TL;DR: ship the deploy artifacts `MILESTONES.md` M7 promised and the ones this plan
added: compose overlays (prod/caddy/scale), `.env.example`, a published Railway template
with a Deploy button in the README, a rewritten README (the current one predates
plugins/MCP/themes), a docs-site deployment page, a first-run flow that ends on a themed
store, and a release checklist run against `deploy-image`.

---

## Current state (verified in-tree)

- `Dockerfile` (3-stage, non-root, healthcheck `/admin/api/health`, `/data` volume) ✅;
  `docker/entrypoint.sh` (chown, SESSION_SECRET hard-fail, migrate-unless-skip, sidecar
  on unix socket) ✅; `docker-compose.yml` (sqlite + postgres profile) ✅;
  `railway.json` (Dockerfile builder, healthcheck, restart policy, numReplicas 1) ✅;
  `deploy-image` (GHCR build + boot smoke + push) ✅; CI image boot test ✅;
  `docs/deployment.md` (Railway steps, plain docker, backups) ✅.
- Missing (each is a task below): Railway template + Deploy button (doc admits "no file
  in this repo defines a template"); `.env.example`; `compose.prod.yml` /
  `compose.caddy.yml` / `compose.scale.yml`; arm64 image (Tailwind checksum pinned
  amd64-only in `dukafi/scripts/install_tailwind.rb`); stale `README.md`; no docs-site
  deployment page; PayHero `poll` gap (lost callback ⇒ order stuck pending);
  first-run ends on a blank page instead of a theme.

## Design & decisions

### Compose overlay set (Instatic-style composable overlays, D10)

| File | Contents |
|---|---|
| `compose.prod.yml` | base: app from `ghcr.io/…` via `DUKAFI_IMAGE` env, `dukafi-data:/data`, `SESSION_SECRET` required from env, sqlite default, port 9292 |
| `compose.postgres.yml` | overlay: postgres 17 + healthcheck, `DATABASE_URL`, migrate service (M15 pattern), app `SKIP_MIGRATIONS=1` |
| `compose.caddy.yml` | overlay: Caddy 80/443, Let's Encrypt from `DOMAIN`, app loses host ports |
| `compose.scale.yml` | overlay on postgres+caddy: `deploy.replicas: ${DUKAFI_REPLICAS:-2}` (M15 Tier 1) |
| `docker-compose.yml` | stays the dev/rehearsal file it is today; header comment points to the overlays |

Every overlay documented with its exact invocation line in `docs/deployment.md`, e.g.
`docker compose -f compose.prod.yml -f compose.postgres.yml -f compose.caddy.yml up -d`.
Overlay gotcha to carry over from Instatic: when disabling an inherited `depends_on`, use
YAML `!reset` — plain `{}` merges.

### `.env.example`

At `core/.env.example`, grouped and commented, exactly the variables the code reads
(source list: `docs/LAUNCH-PLAN.md` audit + `config/paths.rb`): `SESSION_SECRET`,
`PORT`, `DATABASE_URL`, `DB_POOL`, `DUKAFI_DB`, `DUKAFI_STORAGE_ROOT`,
`DUKAFI_PUBLISHED_ROOT`, `DUKAFI_PLUGINS_ROOT`, `DUKAFI_REGISTRY_URL`,
`DUKAFI_SECRET_KEY` (M11), `DUKAFI_DISABLE_SCHEDULER` (M14),
`DUKAFI_PUBLISHED_STORE` (M15 Tier 2), `SKIP_MIGRATIONS`, `SKIP_SIDECAR`,
`DUKAFI_AI_URL` (optional, harness). Explicitly note: AI keys, SMTP and payment
credentials are **not** env vars — they are plugin/connection settings in the dashboard
(`plugin-api.md` rule).

### Railway template

- Railway templates are created from a deployed project (Settings → Share as Template),
  not from a repo file — so the deliverable is (a) a **checklist** in this folder
  (`railway-template-checklist.md`) covering: service from GHCR image (not repo build,
  so template users don't fork), `/data` volume attached pre-first-deploy,
  `SESSION_SECRET=${{secret(64)}}` generated at deploy, healthcheck path, region note;
  (b) the **published template** on the team account; (c) a
  `[![Deploy on Railway](...)](https://railway.app/template/<id>)` button in README.
- Committed `railway.json` keeps `numReplicas: 1` (until M15 Tier 2 is configured
  per-deployment).
- Optional second template variant with Postgres (`DATABASE_URL = ${{Postgres.DATABASE_URL}}`)
  — do it if the first is smooth; volume still required for uploads/published.

### First-run experience

Target flow, end to end, no terminal: deploy → open URL → owner-setup form (exists) →
**"Start with a theme?"** (M13 task 8, `DefaultThemePrompt` fed by bundled/registry
default) → apply → land in the editor on a real storefront → dashboard checklist card
("Add a product, connect a payment provider, connect email, publish"). The checklist
card is new: static list, each item deep-links to the right dashboard section and checks
itself off from real state (products count > seeded, `configured_payment_providers.any?`,
`configured_mail_providers.any?`, last publish time).

### README + docs site

- Rewrite `core/README.md` against the actual tree: what Dukafi is, feature list
  (editor, publisher, commerce, payments/mail/shipping plugins, themes, BYOK AI + image
  generation, MCP), Deploy button, compose quickstart, links to docs site, plugin/theme
  registry pointers, license/attribution unchanged. Delete the stale roadmap claims.
- Docs site (`../docs`): new `deployment.mdx` (Railway + compose overlays + backups +
  scaling pointer), plus the pages other milestones added (`ai-providers.mdx`,
  `themes.mdx`, `email.mdx`). Fill the Algolia placeholder creds in `src/consts.ts` or
  disable the search box for launch (decision: disable if creds aren't ready — a dead
  search box is worse than none).
- `docs/deployment.md` (in-repo) stays the operator truth; the site page links to it.

### Hardening odds and ends (small, launch-tagged)

- **PayHero reconciliation**: no status endpoint exists for `poll`, so add a
  reconciliation job using M14's scheduler: `p.job("reconcile", every: "15m")` in the
  payhero plugin re-parses pending attempts older than 5 minutes against PayHero's
  transaction query API if one is available to the account, else surfaces stuck attempts
  on the plugin dashboard page for manual settle (`Payments.settle` path with an
  operator confirmation). Decide inside the task after reading PayHero's current API
  docs; either outcome removes the silent-stuck-order failure mode.
- **arm64 image**: extend `install_tailwind.rb` with per-arch checksums
  (linux-x64 + linux-arm64), buildx `linux/amd64,linux/arm64` in `deploy-image` and CI.
- Remove the unused `stripe` gem from `dukafi/Gemfile` (a Stripe payment plugin is
  registry material, and the gem contradicts the "credentials are plugin settings" rule).

### Release checklist (`release-checklist.md` in this folder)

Fresh-VM compose deploy from the README alone; Railway template deploy from the button;
owner setup → theme → product → **real M-Pesa payment on a live PayHero account** →
confirmation email received; BYOK AI: chat + image generation with primary provider
disabled mid-test (fallback proven); MCP connect from Claude Code against the deployed
URL; backup + restore drill per `docs/deployment.md`; `scripts/smoke-replicas.sh` green;
CHANGELOG started; tag `v1.0.0`; `deploy-image` push; GitHub release.

## Tasks

1. `.env.example` (AC: every var cross-checked against a grep of `ENV[` / `ENV.fetch`).
2. Compose overlay set + doc invocations (AC: each stack boots + healthcheck green on a
   clean machine; scale overlay passes the M15 smoke script).
3. Railway template checklist doc → deploy → publish template → README button.
4. First-run checklist card (dashboard) + wiring to real state + spec.
5. README rewrite.
6. Docs site: `deployment.mdx`; search decision; verify all new pages in sidebar
   (`src/consts.ts`).
7. PayHero reconciliation job (see decision inside task) + spec.
8. arm64: per-arch Tailwind checksums + multi-platform build in CI/`deploy-image`.
9. Remove unused `stripe` gem.
10. `release-checklist.md` + execute it; tag v1.0.0.
11. Reconcile `MILESTONES.md`: mark M7 items done/superseded with pointers to M15/M16;
    add M11–M16 to the index (see LAUNCH-PLAN pointer section).

## Out of scope

Fly.io/Render/generic-VPS guides (post-launch; compose+caddy covers VPS de facto),
Kubernetes, managed multi-tenant hosting, automated update notifications.

## Related

- `docs/LAUNCH-PLAN.md` D12 (launch definition) — this milestone is its checklist
- `MILESTONES.md` M7/M8 — superseded items reconciled by task 11
- M13 task 8 (theme prompt), M15 Tier 1 (scale overlay + smoke script)
