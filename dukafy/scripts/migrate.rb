require_relative "../config/database"
Sequel::Migrator.run(DB, File.expand_path("../db/migrations", __dir__))
puts "migrated to #{DB[:schema_migrations].count rescue 'n/a'}"
