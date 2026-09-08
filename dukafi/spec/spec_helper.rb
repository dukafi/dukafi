require "tmpdir"

ENV["RACK_ENV"] = "test"
ENV["DUKAFY_DB"] ||= File.join(Dir.tmpdir, "dukafi-test-#{Process.pid}.sqlite3")

# The suite tests the first-party plugins, so it installs them — from the same
# directory an operator would copy from. Nothing is bundled into the app, so
# without this line a store (and this suite) has no payment providers at all,
# which is the point.
ENV["DUKAFI_PLUGINS_ROOT"] ||= File.expand_path("../../plugins-available", __dir__)

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
Dir[File.expand_path("support/*.rb", __dir__)].sort.each { |file| require file }
Dir[File.expand_path("support/*.rb", __dir__)].sort.each { |file| require file }
