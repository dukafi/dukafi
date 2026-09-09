# Dukafi

Own your store. One click to live.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/dukafi-sqlite?referralCode=ANIopl&utm_medium=integration&utm_source=template&utm_campaign=generic)

[One-Click Deploy](#deploy-in-one-click) · [Quick Start](#quick-start) · [Docs](docs/deployment.md)

Dukafi is a self-hosted visual commerce CMS. Merchants design pages, manage a
catalogue, take payments, and publish fast static storefront HTML while carts,
stock, accounts, checkout, and orders remain live server-rendered fragments.

## Deploy in one click

Railway is the fastest way to get a store live. Pick the template, hit the
button, wait a couple of minutes. It generates `SESSION_SECRET`, attaches the
`/data` volume, and sets the health check. You never open a terminal.

*One minute to live. Unedited.*

| Provider | Database | Best for | Deploy |
|---|---|---|---|
| **Railway** · *Recommended* | SQLite | A single store — one merchant, one volume | [Deploy →](https://railway.com/deploy/dukafi-sqlite?referralCode=ANIopl&utm_medium=integration&utm_source=template&utm_campaign=generic) |
| **Railway** | Postgres | Managed backups, room to grow | [Deploy →](https://railway.com/deploy/dukafi-sqlite?referralCode=ANIopl&utm_medium=integration&utm_source=template&utm_campaign=generic) |
| **Docker / VPS** | SQLite or Postgres | Bring-your-own server, Caddy TLS, custom backup policy | [Guide →](docs/deployment.md) |

SQLite is the right default for most shops. Reach for Postgres when you want
managed database backups or more than one replica.

### Updating is just a redeploy

When a new Dukafi version is available, update by redeploying
`ghcr.io/dukafi/dukafi:latest`. The database, uploads, plugins, and published
HTML stay on the attached volume.

Prefer your own hardware?

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
scaling. Full guides for backups and storage are in
[docs/deployment.md](docs/deployment.md).

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
- `plugins-available/` — first-party and reference plugins
- `docs/` — operator and architecture documentation
- `compose.*.yml` — composable production stacks

The plugin/theme registry is a separate Go service:
[github.com/dukafi/plugins](https://github.com/dukafi/plugins). Stores talk to
it over HTTP (`registry.dukafi.dev`). This repo does not vendor that code.

## Verify

```sh
cd dukafi && bundle exec rake test
cd ../dukafi-editor && bun run build
```

Start with [the plugin API](dukafi/docs/plugin-api.md) when extending Dukafi.

## Contributing

Thank you for considering contributing to Dukafi. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) for how we take bug reports, features, and
pull requests.

## Code of Conduct

This project is released with a [Contributor Covenant Code of
Conduct](CODE_OF_CONDUCT.md). By participating you agree to that code.

## Security Vulnerabilities

If you discover a security vulnerability, please follow
[SECURITY.md](SECURITY.md) and report it privately. Do not open a public
issue.

## Support

How-to questions belong in the docs, not the issue tracker. See
[.github/SUPPORT.md](.github/SUPPORT.md).

## License

Dukafi is open-source software licensed under the [MIT license](LICENSE).

Hosted or commercial products built *around* Dukafi can stay proprietary —
the same split Laravel uses between the framework and Laravel Cloud. This
repository is the MIT product.

## Attribution

The visual editing experience is derived from
[Instatic](https://github.com/CoreBunch/Instatic), © David Babinec, under the MIT
License. Required notices ship in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
