# Dukafi

Own your store. One click to live.

Dukafi is a self-hosted visual commerce CMS. Merchants design pages, manage a
catalogue, take payments, and publish fast static storefront HTML while carts,
stock, accounts, checkout, and orders remain live server-rendered fragments.

## What ships

- React visual editor with components, responsive design, media, forms, templates,
  themes, and a draft/publish workflow
- Ruby/Roda commerce backend with products, variants, collections, discounts,
  customers, orders, reviews, custom tables, and CSV import
- Atomic static publisher with optional database-backed output for replicas
- Provider-neutral payment, mail, shipping, image, and media-storage plugin seams
- Named BYOK AI connections for OpenAI, Anthropic, OpenRouter, Ollama, and compatible APIs
- MCP over authenticated Streamable HTTP for content, commerce, media, plugins,
  AI images, and publishing
- SQLite or Postgres; Compose overlays for TLS and same-host replicas

## Quick start

Development requires Ruby 3.4+, Bundler, Bun, and libvips:

```sh
cd dukafi && bundle install
cd ../dukafi-editor && bun install
cd .. && ./bin/dev
```

Open the editor at <http://localhost:5173/admin/> and the storefront at
<http://localhost:9292/>. See [SETUP.md](SETUP.md) for local setup.

Production with SQLite:

```sh
cp .env.example .env
# Set SESSION_SECRET to: openssl rand -hex 64
docker compose --env-file .env -f compose.prod.yml up -d
```

Postgres with automatic TLS:

```sh
docker compose --env-file .env \
  -f compose.prod.yml -f compose.postgres.yml -f compose.caddy.yml up -d
```

Add `-f compose.scale.yml` for same-host replicas. Postgres is required when
scaling. See [deployment guidance](docs/deployment.md) for backups and storage.

The Railway template must be published from the team account. Its setup is in
[the template checklist](docs/milestones/m16-launch-deploy/railway-template-checklist.md).

## Architecture

```text
Editor → authenticated Ruby API → SQLite/Postgres
                         │ Publish
                         ▼
                pure Ruby renderer
                         ▼
          disk slots or transactional DB versions
                         ▼
          static storefront + HTMX fragments
```

Merchant state lives under `/data` in the production image. Provider credentials
are write-only dashboard settings, not build-time secrets.

## Repository

- `dukafi/` — Ruby app, publisher, migrations, services, and tests
- `dukafi-editor/` — visual editor and admin application
- `registry/` — Go plugin/theme registry
- `plugins-available/` — first-party and reference plugins
- `docs/` — operator and architecture documentation
- `compose.*.yml` — composable production stacks

## Verify

```sh
cd dukafi && bundle exec rake test
cd ../registry && go test ./...
cd ../dukafi-editor && bun run build
```

Start with [the plugin API](dukafi/docs/plugin-api.md) when extending Dukafi.

## Attribution

The visual editing experience is derived from
[Instatic](https://github.com/CoreBunch/Instatic), © David Babinec, under the MIT
License. Required notices ship in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
