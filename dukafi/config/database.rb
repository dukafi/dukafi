require "sequel"
require_relative "paths"

# One store, either engine.
#
# SQLite is the default because it needs nothing installed and a single file
# on a volume is a complete backup. DATABASE_URL switches to Postgres, which
# is what a managed platform hands you.
#
# The PRAGMAs are SQLite-only tuning and must not run against Postgres, where
# they are syntax errors rather than no-ops.
#
# DATABASE_URL is passed to Sequel verbatim. Railway and Heroku publish
# `postgres://` while Render publishes `postgresql://`, and Sequel resolves
# the adapter from either — checked against the pinned version rather than
# assumed, so there is no rewriting step here to go stale.
url = ENV["DATABASE_URL"].to_s

DB =
  if url.empty?
    Sequel.sqlite(Paths.database)
  else
    Sequel.connect(url, max_connections: Integer(ENV.fetch("DB_POOL", "5")))
  end

if DB.adapter_scheme.to_s.start_with?("sqlite")
  DB.run "PRAGMA journal_mode = WAL"
  DB.run "PRAGMA synchronous = NORMAL"
  DB.run "PRAGMA busy_timeout = 5000"
  DB.run "PRAGMA foreign_keys = ON"
  DB.run "PRAGMA cache_size = -64000"
end

Sequel::Model.db = DB
Sequel::Model.plugin :timestamps, update_on_create: true
Sequel::Model.plugin :validation_helpers
Sequel.extension :migration
