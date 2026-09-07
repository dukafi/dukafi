# Dukafi launch plan — gap analysis, decisions, and milestone index

Scope: this document is the single entry point for everything that must be built to launch
Dukafi 1.0. It records what already exists in the tree, what is missing, the design decisions
made for each gap, and the index of launch milestones (M11–M16) that live under
`docs/milestones/`. Every claim below is anchored to a real file. Read this first; read the
milestone READMEs to implement.

TL;DR: the core product (editor, publisher, commerce, payments-as-plugins, MCP, plugin
registry) is substantially built. Six gaps stand between the tree and a launch:
(1) AI in core is single-provider and chat-only, (2) image generation does not exist in core,
(3) the theme marketplace has a client but no server, (4) email has no provider seam and
order-confirmation email is unimplemented, (5) replicas are impossible because published
output and uploads are per-container disk and plugin jobs have no scheduler, and
(6) the deploy story (Railway template, compose overlays, `.env.example`, README) is
unfinished. M11–M16 close them in dependency order.

---

## Principle zero: the core is standalone. Dukafi AI is v2.

The sibling repo `../ai` (the hosted "Dukafi AI" harness) is **not** part of the 1.0 launch
and nothing in this plan depends on it. The rule, restated from `../ai/vision.md` and
enforced here in the other direction:

- A merchant who installs Dukafi with **no AI configured at all** gets a complete,
  first-class product: editor, themes, catalogue, checkout, payments, publishing.
- A merchant who brings **their own API key** (OpenAI, Anthropic, OpenRouter, Groq,
  Ollama, any OpenAI-compatible endpoint) gets the full AI experience — chat assist AND
  image generation — from core alone, with no Dukafi service in the loop.
- `provider=dukafi` (the harness hookup in `plugins-available/ai/plugin.rb` and
  `dukafi/services/dukafi_ai.rb`) stays in the tree as an **optional** provider choice.
  It must never be required, never be the default, and its absence must never degrade
  any other feature. Do not extend it during M11–M16.

Every milestone below must keep this true. If a task can only be finished by calling the
harness, the task is wrong.

---

## Current state: exists vs missing

Verified against the tree (September 2026). Paths relative to `core/`.

### A. Provider flexibility

| Area | Exists | Missing |
|---|---|---|
| Payments | Full provider abstraction: 3 verbs + `normalize_amount` (`dukafi/services/payments.rb`), self-describing providers, runtime discovery filtered by `configured?`, host-owned amounts (`dukafi/services/charge.rb`), two shipped providers (`plugins-available/payhero`, `plugins-available/fake_payments`) | PayHero has no `poll` (lost callback = stuck attempt); no refund verb; `stripe` gem in Gemfile with no provider |
| AI chat | `dukafi/services/ai_chat.rb`: any OpenAI-compatible `base_url` + a dedicated Anthropic wire; server holds the key; 7 presets in `dukafi-editor/.../AiSettingsPopover.tsx` | One provider at a time (single `ai` plugin settings row); no driver registry; no capability model; no multiple connections; no per-task defaults; no fail-closed capability gates |
| AI images | **Nothing.** Grep-verified: no image generation anywhere in `core/` | Everything — see M12 |
| Email | **Nothing.** No SMTP/mailer code; `docs/milestones/m5-cart-checkout/tasks/08-order-confirmation-email.md` unimplemented | `mail_provider` seam, SMTP plugin, order-confirmation flow — see M14 |
| Shipping | `orders.shipping_cents` column, hardcoded `0` (`dukafi/services/create_order.rb`, `charge.rb`) | `shipping_provider` seam + flat-rate plugin — see M14 |
| Object storage | **Nothing** for store media (registry's `s3blobs.go` is the registry's own bucket) | Media storage adapter — see M15 |

### B. Themes

| Exists | Missing |
|---|---|
| Archive format (`dukafi/services/theme_archive.rb`), exporter, importer with per-section options + media remap, registry client with sha256 verification (`theme_catalogue.rb`), admin routes (`routes/admin_api.rb` ~931–1004), editor UI (`ThemeApplyForm.tsx`, `DefaultThemePrompt.tsx`) | The registry (`registry/*.go`) has **zero** theme endpoints — `/v1/themes/*` is called by the store and served by nobody. No bundled starter theme (`StarterSite.create!` seeds one blank page). No in-app gallery/browse UI. No theme submission path for creators. — see M13 |

### C. Replicas / volume separation

| Exists | Missing |
|---|---|
| All four state roots env-relocatable through `dukafi/config/paths.rb`; image writes only to `/data`; `SKIP_MIGRATIONS=1` for non-migrating instances; migrations idempotent at boot; sessions are signed cookies; carts are DB rows; `DATABASE_URL` moves the DB off-box | Published HTML + uploads are per-container local disk (`docs/deployment.md`: "Run one replica"); `railway.json` pins `numReplicas: 1`; no publish lock; `PluginJobs.run_due` has **no caller** (no scheduler, no leader election); no shared/object storage — see M15 |

### D. Deploy

| Exists | Missing |
|---|---|
| `Dockerfile` (3-stage, non-root, healthcheck, `/data` volume), `docker/entrypoint.sh`, `docker-compose.yml` (sqlite + postgres profile), `railway.json`, `docs/deployment.md`, `deploy-image` GHCR script, CI image boot test | No Railway template (doc admits "no file in this repo defines a template"); no `.env.example`; no `compose.prod.yml` / TLS overlay / scale overlay; amd64-only; `README.md` materially stale (pre-plugins/MCP/themes); docs site has no deployment page — see M16 |

---

## Decisions (D1–D12)

These are settled. Milestone READMEs elaborate; do not re-litigate them mid-build.

- **D1 — Port Instatic's driver pattern to Ruby, not its runtime.** AI providers become
  plain driver objects behind one registry (`Dukafi::Ai::Drivers`), each contributing only
  wire-mapping functions; one shared request loop owns HTTP, streaming, and errors. Five
  drivers at launch: `anthropic`, `openai`, `openrouter`, `ollama`, `openai_compatible`
  (covers Groq, DeepSeek, Together, Mistral, LM Studio, vLLM). `dukafi` (harness) remains a
  sixth, optional, untouched.
- **D2 — Multiple named AI connections, per-task defaults.** New `ai_connections` table
  replaces the single `ai` plugin-settings row (with migration). Separate defaults for
  `chat` and `image` tasks. This is what makes cross-provider image fallback possible.
- **D3 — Capabilities are a typed struct, resolved server-side, failing closed.**
  `tool_calling / vision_input / image_generation / streaming` per (connection, model).
  The server is the authority; the editor picker is a hint. Unknown ⇒ false.
- **D4 — Image generation = two core wire formats + a plugin seam.** Core speaks
  `images-api` (OpenAI `POST {base}/images/generations` — OpenAI, OpenRouter, Together,
  xAI) and `chat-modalities` (OpenRouter/Gemini-style `modalities: ["image","text"]`).
  Anything else (Replicate, fal.ai, Stability, local ComfyUI) arrives via a new
  `p.image_provider` plugin seam, mirroring how payments work. That combination is the
  "100% flexibility" requirement.
- **D5 — Image fallback is an ordered chain, never silent.** Try the image-default
  connection, then every other image-capable connection/provider in priority order, with
  endpoint-level fallback inside each. Total failure returns a typed error the UI turns
  into "pick from library / upload instead" — never a blank slot, never a fake image.
- **D6 — Generated images are media assets with provenance.** They land through the
  existing upload pipeline (`MediaAsset`, WebP variants) tagged with prompt, model,
  provider, and connection id. Generation is always an explicit user action in core.
- **D7 — Themes ship in the registry AND in the image.** The Go registry gets
  `/v1/themes` (list/get/default) plus submission/approval reusing the plugin listing
  machinery. One starter theme archive is bundled into the Docker image so first-run works
  with the registry unreachable. `GET /admin/api/cms/themes/default` prefers the registry,
  falls back to the bundled archive.
- **D8 — Mail mirrors payments.** `p.mail_provider` seam with one verb
  (`deliver(message:, config:)`), first-party `smtp` plugin + `fake_mail` dev plugin,
  and a core listener on `order.paid` that sends the confirmation email when a mail
  provider is configured and logs-and-skips when none is.
- **D9 — The scheduler is a leader-elected timer, not a new dependency.** A timer thread
  calls `PluginJobs.run_due` every 60s, guarded by a DB-row claim lock that works on both
  SQLite and Postgres. Replicas that lose the claim do nothing. No Redis, no cron sidecar.
- **D10 — Replicas come in two tiers.**
  Tier 1 (docker-compose, one host): N app replicas share one named volume behind a Caddy
  proxy; a dedicated **migrator service** owns the volume (mkdir/chown + migrations), app
  replicas run `SKIP_MIGRATIONS=1`; Postgres required for >1 replica; publish is
  single-flight via DB lock. This is the modern answer to "an image that just holds the
  volume" — a named volume shared across services, with one short-lived service as its
  owner. (Data-only containers are a deprecated Docker pattern; named volumes replaced
  them.)
  Tier 2 (multi-node / Railway replicas): uploads move behind a media storage adapter
  (S3/R2/Railway bucket plugin) and published output moves into a DB-backed published
  store. Tier 1 is launch-blocking; Tier 2 is the fast-follow that lifts
  `numReplicas: 1`.
- **D11 — Published store is an abstraction with two backends.** `disk` (today's two-slot
  symlink flip, default, zero-config) and `db` (rows in `published_files`, atomic flip as
  a transaction — what multi-node replicas serve from). Chosen over publish-to-S3 because
  it adds no new infrastructure beyond the Postgres that replicas already require.
- **D12 — Launch definition.** 1.0 ships when: a merchant can deploy via the Railway
  template or `docker compose up` with only `SESSION_SECRET` to think about; first run
  offers a starter theme; they can take a real M-Pesa payment and receive an order
  confirmation email; with their own API key they can chat-assist and generate images
  from at least two unrelated providers with working fallback; and compose can run
  `--scale dukafi=2` without corruption.

---

## Milestone index

Numbering continues `MILESTONES.md` (M0–M10). Each milestone lives at
`docs/milestones/<id>-<slug>/README.md` following the m5 pattern.

| Id | Milestone | Depends on | Launch-blocking |
|---|---|---|---|
| [M11](milestones/m11-ai-provider-core/README.md) | AI provider core — driver registry, connections, capabilities | — | Yes |
| [M12](milestones/m12-image-generation/README.md) | Image generation with cross-provider fallback | M11 | Yes |
| [M13](milestones/m13-theme-marketplace/README.md) | Theme marketplace — registry endpoints, starter themes, in-app gallery | — | Yes |
| [M14](milestones/m14-provider-seams/README.md) | Provider seams — mail, job scheduler, shipping | — | Yes (mail + scheduler); shipping seam only |
| [M15](milestones/m15-replicas-and-storage/README.md) | Replicas & storage separation (Tier 1 + Tier 2) | M14 (scheduler lock) | Tier 1 yes; Tier 2 fast-follow |
| [M16](milestones/m16-launch-deploy/README.md) | Launch & deploy — Railway template, compose overlays, docs, release | M13, M15 Tier 1 | Yes |

Suggested build order: **M11 → M12** (one track) in parallel with **M13** (independent) and
**M14** (independent); then **M15 Tier 1 → M16**. M15 Tier 2 can land after launch without
breaking anything shipped.

## Launch checklist (condensed from D12)

- [ ] M11 complete: zero-AI install fully usable; BYOK chat works against ≥3 provider kinds
- [ ] M12 complete: image generation works; fallback proven by disabling the primary provider
- [ ] M13 complete: registry serves themes; starter theme bundled; gallery browse/install in admin
- [ ] M14 complete: order confirmation email delivered via SMTP plugin; scheduler runs plugin jobs
- [ ] M15 Tier 1 complete: `docker compose --scale` with 2 replicas passes the smoke script
- [ ] M16 complete: Railway template published; `.env.example`; compose overlays; README rewritten; docs site deployment page live
- [ ] `MILESTONES.md` M7 items reconciled (some already done, some superseded by M16)

## Related

- `MILESTONES.md` — M0–M10 and the post-1.0 parking lot (multi-currency, sandboxed store
  plugins, carrier shipping, SMS remain parked)
- `VISION.md` — product principles these milestones must not violate
- `docs/deployment.md` — current single-replica deployment truth; M15/M16 revise it
- `dukafi/docs/plugin-api.md` — plugin seam design doc; M12/M14 add seams to its model
- `../instatic-inspo/` — reference implementation for the driver pattern (`server/ai/drivers/`),
  storage adapters (`docs/features/media.md`), and compose overlays (`compose.*.yml`)
