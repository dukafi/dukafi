require "tmpdir"

ENV["RACK_ENV"] = "test"
ENV["DUKAFY_DB"] ||= File.join(Dir.tmpdir, "dukafy-test-#{Process.pid}.sqlite3")

require_relative "../config/database"
Sequel::Migrator.run(DB, File.expand_path("../db/migrations", __dir__))
require_relative "../config/environment"
require "minitest/autorun"
