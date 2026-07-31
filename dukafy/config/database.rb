require "sequel"

DB = Sequel.sqlite(ENV.fetch("DUKAFY_DB", File.expand_path("../db/dukafy.sqlite3", __dir__)))
DB.run "PRAGMA journal_mode = WAL"
DB.run "PRAGMA synchronous = NORMAL"
DB.run "PRAGMA busy_timeout = 5000"
DB.run "PRAGMA foreign_keys = ON"
DB.run "PRAGMA cache_size = -64000"
Sequel::Model.db = DB
Sequel::Model.plugin :timestamps, update_on_create: true
Sequel.extension :migration
