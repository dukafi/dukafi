require_relative "../config/database"
Sequel::Migrator.run(DB, File.expand_path("../db/migrations", __dir__))
require_relative "../config/environment"

result = DemoStoreSeeder.call
puts "Demo store ready: #{result.products} products, #{result.variants} variants, #{result.collections} collections"
