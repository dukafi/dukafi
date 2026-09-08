# SQLite and PostgreSQL (migrations 044–047)

The image ships both Sequel adapters. CI runs the Ruby suite against SQLite
and PostgreSQL so engine-only regressions cannot land unnoticed.

## Migration surface

| Migration | Adds |
|-----------|------|
| **044** | `ai_connections`, `ai_defaults` (plus data migrate from `plugin_settings` for plugin `ai`) |
| **045** | `media_assets.origin`, `media_assets.origin_meta`; `ai_usage_events` |
| **046** | `scheduler_locks`, `mail_logs`; `orders.shipping_meta` |
| **047** | `media_assets.storage`; `published_files`, `published_states` |

## Column types that stay portable

- JSON-shaped values are stored as **text** (or JSON/text that Sequel reads as
  strings/hashes) — avoid Postgres-only `jsonb` operators in application code
  for these rows.
- Booleans use Sequel/`TrueClass` conventions that work on both engines
  (SQLite stores 0/1; Postgres uses native boolean).

## Scheduler locks

`SchedulerLock` claim, stale-lock steal, and heartbeat renewal must behave the
same on SQLite and PostgreSQL. Specs cover first claim, contention, steal, and
heartbeat on whichever engine the matrix leg is running.

## Published / media backends

`published_files` / `published_states` and `media_assets.storage` are used
identically on both engines when `DUKAFI_PUBLISHED_STORE=db` or when media is
migrated off local disk.
