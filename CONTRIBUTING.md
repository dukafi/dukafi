# Contributing to Dukafi

Thank you for considering a contribution. Dukafi is MIT licensed: you keep
copyright in your work, and by opening a pull request you license that work
under the same MIT terms as the rest of the project. There is no CLA.

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

If you believe you have found a vulnerability, **do not open a public
issue**. Follow [SECURITY.md](SECURITY.md).

## Questions vs bugs

GitHub issues are for bugs and concrete, actionable work.

- How do I run or deploy Dukafi? Start with [SETUP.md](SETUP.md) and
  [docs/deployment.md](docs/deployment.md).
- How do I write a plugin? Start with [dukafi/docs/plugin-api.md](dukafi/docs/plugin-api.md).
- Product discussion that is not yet a change request belongs in a discussion,
  not a half-finished PR.

## Bug reports

A useful report includes:

1. What you expected
2. What happened
3. Dukafi version or Git commit, and whether you are on SQLite or Postgres
4. Steps to reproduce, as small as you can make them

If the bug is in the published storefront, say whether it appears in the
editor canvas, after publish, or both.

## Features

Open an issue before a large feature so we can agree on shape. Small, obvious
fixes do not need a ticket first.

Dukafi is one store per deploy, with a visual editor and a mostly-static
storefront. Features that turn it into a generic site builder, a multi-tenant
SaaS in this repo, or a second product should stay out of this tree — those
can be separate proprietary products, the same way Laravel Cloud sits next to
Laravel.

## Pull requests

1. Branch from `master`.
2. Keep the change focused. One concern per PR.
3. Match the style of the files you touch. Do not reformat unrelated code.
4. Tests go with the code:
   - Ruby: `cd dukafi && bundle exec rake test`
   - Editor: `cd dukafi-editor && bun test`

   Registry changes belong in [dukafi/plugins](https://github.com/dukafi/plugins).
5. If you change behaviour an operator would notice, update the relevant doc
   (`SETUP.md`, `docs/deployment.md`, `dukafi/docs/plugin-api.md`, or the
   public developer docs).
6. Do not commit secrets, `.env` files, or merchant data.

Local setup is in [SETUP.md](SETUP.md):

```sh
cd dukafi && bundle install
cd ../dukafi-editor && bun install
cd .. && ./bin/dev
```

Editor: <http://localhost:5173/admin/>  
Storefront: <http://localhost:9292/>

## Where code lives

| Path | What to change |
|---|---|
| `dukafi/` | Ruby app, publisher, commerce, MCP, tests |
| `dukafi-editor/` | Visual editor and admin UI |
| `plugins-available/` | First-party plugins |
| `docs/` | Operator and architecture notes |

The plugin catalogue service is [dukafi/plugins](https://github.com/dukafi/plugins), not this tree.

The editor is a fork of [Instatic](https://github.com/CoreBunch/Instatic).
Keep that MIT notice in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) when you
touch the editor bundle.

## Review

Maintainers may ask for tests, a smaller surface, or a different approach.
That is normal. If a PR goes stale, we may close it — you can reopen when it
is ready again.
