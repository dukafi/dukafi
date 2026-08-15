require_relative "../config/database"

migrations = File.expand_path("../db/migrations", __dir__)
Sequel::Migrator.run(DB, migrations)

# What version we ended on — the only feedback a container deploy gives you
# that the schema is where it should be.
#
# Which table holds it depends on the migrator: numbered files (001_, 002_)
# use `schema_info.version`, timestamped ones use a row per file in
# `schema_migrations`. Both are handled so this keeps reporting if the
# migration style ever changes.
version =
  if DB.table_exists?(:schema_info)
    DB[:schema_info].get(:version)
  elsif DB.table_exists?(:schema_migrations)
    DB[:schema_migrations].count
  end

puts "migrated to #{version || 'unknown'} (#{Dir[File.join(migrations, '*.rb')].length} migrations on disk)"
