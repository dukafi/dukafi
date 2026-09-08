# Remaining implementation work

This is the remaining coding-agent work for M11–M16. It intentionally excludes
operator-only actions such as publishing a Railway template, creating a GitHub
release, pushing an image to GHCR, configuring live credentials, or performing a
real-money payment drill.

## M11 — AI provider core

- [x] Add focused capability-cache specs under `dukafi/spec/services/` covering:
  - successful live model resolution is cached for five minutes;
  - failed live resolution fails closed for vision and image generation;
  - editing a connection invalidates the cached capabilities.
- [x] Add driver model-listing specs for OpenRouter modality metadata, Ollama
  `/api/show`/model discovery, and OpenAI family filtering using stubbed HTTP
  responses.
- [x] Add golden request/response specs for the Anthropic and OpenAI-compatible
  driver wires, including headers, system messages, streaming, and provider
  error normalization.
- [x] Add route coverage for connection editing, model discovery, connection
  testing, default selection, secret masking, deletion restrictions, and both
  capability gates.
- [x] Add a manual-flow note or automated UI test for creating an OpenRouter
  connection, loading models, selecting design/image defaults, and testing it.

## M12 — Image generation

- [x] Add wire-client specs for:
  - base64 image responses;
  - URL-backed image responses;
  - HTTPS enforcement and loopback exceptions;
  - response-size limits;
  - malformed provider payloads and provider errors.
- [x] Add chain-orchestrator specs proving default-first ordering, explicit
  connection/model selection, four-attempt/60-second budget enforcement, and
  sanitized attempt details.
- [x] Add image-provider registry/discovery specs mirroring payment-provider
  discovery coverage.
- [x] Add route specs for successful generation, unconfigured AI (409), and
  provider-chain failure (502) responses.
- [x] Add an integration failure-drill spec proving a failed primary provider
  falls through to a working secondary provider and that all-failed attempts do
  not leave `MediaAsset` rows behind.
- [x] Add the requested media origin UI:
  - origin badge for AI-generated assets;
  - filter for uploaded versus AI-generated assets;
  - refresh behavior after generation.
- [x] Add a dedicated image-generation module/action for editor insertion if
  generation is intended to be available from the canvas, not only the Media
  workspace.

## M13 — Theme marketplace

- [x] Add Go registry tests for `registry/themes.go` covering:
  - list filtering;
  - category filtering;
  - default-rank selection;
  - missing-theme 404s;
  - exact response keys expected by `ThemeCatalogue`.
- [x] Add submission tests for authentication, rate limiting, malformed archives,
  oversized archives, invalid file sets, checksum generation, ownership, and
  approval.
- [x] Add a fresh-store integration spec that installs the bundled starter theme,
  applies it, publishes it, and verifies the generated storefront.
- [x] Add applied-theme persistence/display specs, including dashboard state.
- [x] Add a dashboard gallery UI test for catalogue rendering, install wiring,
  and degraded/offline bundled-theme fallback.
- [x] Update `registry/README.md` with the theme submission, approval, archive,
  and download contracts.

## M14 — Provider seams

- [x] Add mail-provider discovery specs.
- [x] Add SMTP integration coverage using a spec-local fake TCP SMTP server.
- [x] Add fake-mail plugin tests for delivery, outbox persistence, and dashboard
  page rows.
- [x] Add `Mailer` specs for configured delivery, unconfigured skip/logging,
  provider failure, and `order.paid` flow isolation.
- [x] Add `SchedulerLock` specs for first claim, contention, stale-lock steal,
  and heartbeat renewal on SQLite and PostgreSQL-compatible behavior.
- [x] Add scheduler thread specs for due-job execution, one-shot stamping,
  exception survival, kill switch, and non-leader behavior.
- [x] Add jobs-status route and dashboard-surfacing specs.
- [x] Add shipping seam specs for no-provider checkout compatibility, flat-rate
  totals, server-side re-resolution, and tampered-rate rejection.
- [x] Add focused `flat_rate` plugin tests.

## M15 — Replicas and storage

- [x] Add the writable-roots architecture spec documenting and enforcing which
  paths may be written by the app, publisher, media layer, and sidecar.
- [x] Add LocalDisk/media-storage seam specs and adapter selection coverage.
- [x] Add S3 storage tests against MinIO or an equivalent local S3-compatible
  test server, covering SigV4 PUT, HEAD, DELETE, URL generation, and failures.
- [x] Add `migrate_media.rb` tests for dry-run, copying, checksum verification,
  idempotency, and missing-source handling.
- [x] Add PublishedStore concurrency tests proving readers never observe a mixed
  version during activation and that the LRU invalidates correctly.
- [x] Add call-site regression coverage for storefront assets, publisher output,
  sitemap output, and published-file reads with both disk and database stores.
- [x] Add a boot-warning spec for multiple replicas using disk-backed published
  storage.
- [x] Add a CI/manual Compose smoke job that exercises the scale overlay when a
  Docker daemon is available.

## M16 — Launch/deployment code

- [x] Add an automated `.env.example` audit that compares every `ENV[]` and
  `ENV.fetch` use against documented variables and reports undocumented reads.
- [x] Add Compose config/startup tests for the production, PostgreSQL, Caddy,
  and scale overlays; keep the default CI pipeline independent of Docker.
- [x] Add first-run checklist specs verifying product, payment, mail, and publish
  state transitions and deep links.
- [x] Add PayHero reconciliation specs for status parsing, success/failure
  mapping, stale-attempt filtering, amount-safe settlement, and network failure
  handling. The API path is documented in the provider adapter.
- [x] Add architecture/build coverage for both Tailwind target architectures and
  verify the multi-platform `deploy-image` manifest in CI where buildx is
  available.
- [x] Add a release smoke script that validates image boot, migrations, health,
  and the generated admin bundle without publishing anything.

## Cross-cutting quality work

- [x] Add UI tests for the AI connections/model selector and image-generation
  dialog.
- [x] Add API schema validation for the new AI, image, theme, shipping, mail,
  and jobs payloads where the editor currently uses hand-written response types.
- [x] Document SQLite/PostgreSQL behavioral notes for migrations 044–047
  (`docs/architecture/sqlite-postgres.md`); CI matrix already runs both engines.
- [x] Add focused test fixtures/factories for AI connections, generated media,
  themes, mail logs, scheduler locks, and published-store versions to reduce
  setup duplication.
- [x] Re-run the complete Ruby suite, editor build, docs build, and registry
  tests after each group is completed.

## Explicitly excluded operator actions

These are not coding-agent tasks and are intentionally not included above:

- publishing or configuring the Railway template;
- creating GitHub tags/releases;
- pushing the production image to GHCR;
- making the GHCR package public;
- entering production OpenRouter, SMTP, PayHero, S3, or database credentials;
- completing a live payment, email, backup/restore, or deployed MCP drill.
