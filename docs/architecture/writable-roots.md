# Writable roots

Dukafi never writes arbitrary paths. Runtime writes go through `Paths`
(`dukafi/config/paths.rb`), which resolves environment-backed roots.

## Allowed roots

| Root | Env (preferred / legacy) | Contents |
|------|--------------------------|----------|
| Database file | `DUKAFI_DB` / `DUKAFY_DB` | SQLite file when Postgres is not configured via `DATABASE_URL` |
| Storage | `DUKAFI_STORAGE_ROOT` / `DUKAFY_STORAGE_ROOT` | Contains `uploads/` (media bytes). Relative asset paths stay `uploads/…` |
| Published storefront | `DUKAFI_PUBLISHED_ROOT` / `DUKAFY_PUBLISHED_ROOT` | Bake slots + `current` symlink (disk backend) |
| Installed plugins | `DUKAFI_PLUGINS_ROOT` / `DUKAFY_PLUGINS_ROOT` | One directory per installed plugin |

Temporary scratch uses `Dir.mktmpdir` / `Tempfile` (and `Dir.tmpdir`) only —
never a hard-coded `/tmp/...` product path that bypasses those helpers.

## Published store backend

`DUKAFI_PUBLISHED_STORE` is `disk` (default) or `db`.

- **disk** — baked HTML/CSS/XML live under `DUKAFI_PUBLISHED_ROOT`.
- **db** — Bake still writes a local slot for the compiler, then
  `PublishedStore.import_directory` copies file bytes into
  `published_files` / `published_states` so every replica reads the same
  activated version.

**Replica warning:** multiple process replicas (`DUKAFI_REPLICAS` > 1) with
`DUKAFI_PUBLISHED_STORE=disk` can diverge — each replica has its own disk.
Boot prints a stderr warning and operators should set
`DUKAFI_PUBLISHED_STORE=db` (see `Dukafi.warn_storage_config!`).
