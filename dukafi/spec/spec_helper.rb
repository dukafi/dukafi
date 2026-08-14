require "tmpdir"

ENV["RACK_ENV"] = "test"
ENV["DUKAFY_DB"] ||= File.join(Dir.tmpdir, "dukafi-test-#{Process.pid}.sqlite3")

require_relative "../config/database"

# The suite runs against whichever engine is configured: SQLite by default,
# Postgres when DATABASE_URL is set (which is how CI exercises both).
#
# SQLite gets a fresh file per process from the path above. Postgres is a
# persistent server, so the schema is dropped and rebuilt instead — otherwise
# a rerun inherits the previous run's rows and specs that count records fail
# for reasons that have nothing to do with the code.
if DB.database_type == :postgres
  DB.drop_schema(:public, cascade: true, if_exists: true)
  DB.create_schema(:public)
end

Sequel::Migrator.run(DB, File.expand_path("../db/migrations", __dir__))
require_relative "../config/environment"
require "minitest/autorun"
